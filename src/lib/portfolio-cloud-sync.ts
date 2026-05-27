import type { SupabaseClient } from "@supabase/supabase-js";
import type { SoldLot, StockHolding, TradeLot } from "@/store/portfolioStore";

export type PortfolioSlice = {
  cashBalance: number;
  stocks: StockHolding[];
  lotsBySymbol: Record<string, { open: TradeLot[]; sold: SoldLot[] }>;
};

function finiteOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeDateString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function snapshotValuationPrice(stock: StockHolding): number {
  if (Number.isFinite(stock.lastPrice) && (stock.lastPrice ?? 0) > 0) {
    return stock.lastPrice as number;
  }
  if (Number.isFinite(stock.averageCost) && stock.averageCost > 0) {
    return stock.averageCost;
  }
  return 0;
}

function etCalendarDateString(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}

function holdingPayload(s: StockHolding, lots: { open: TradeLot[]; sold: SoldLot[] } | undefined) {
  const optimized = !s.pendingOptimization;
  const openLots = (lots?.open ?? []).flatMap((lot) => {
    const quantity = finiteOrNull(lot.quantity);
    const costBasis = finiteOrNull(lot.costBasis);
    const purchaseDate = normalizeDateString(lot.purchaseDate);
    if (quantity == null || quantity <= 0 || costBasis == null || costBasis <= 0 || purchaseDate == null) {
      return [];
    }

    return [{
      lotId: lot.id,
      symbol: s.symbol,
      quantity,
      costBasis,
      purchaseDate,
      status: lot.status,
      account: lot.account ?? null,
      isRetirementAccount: lot.isRetirementAccount ?? null,
    }];
  });
  const soldLots = (lots?.sold ?? []).flatMap((lot) => {
    const salePrice = finiteOrNull(lot.salePrice);
    const quantity = finiteOrNull(lot.quantity);
    const realizedGainLoss = finiteOrNull(lot.realizedGainLoss);
    const saleDateIso = normalizeDateString(lot.saleDate);
    if (
      salePrice == null ||
      salePrice <= 0 ||
      quantity == null ||
      quantity <= 0 ||
      realizedGainLoss == null ||
      saleDateIso == null
    ) {
      return [];
    }

    const originalCostBasis = salePrice - realizedGainLoss / quantity;
    if (!Number.isFinite(originalCostBasis)) {
      return [];
    }

    return [{
      salePrice,
      quantity,
      originalCostBasis,
      saleDateIntervalSince1970: Date.parse(saleDateIso) / 1000,
    }];
  });
  return {
    symbol: s.symbol,
    quantity: s.quantity,
    averageCost: s.averageCost,
    lastPrice: snapshotValuationPrice(s),
    shortSMA: optimized ? s.shortSMA : null,
    dynamicFactor: optimized ? s.dynamicFactor : null,
    stockLimit: optimized ? s.stockLimit : null,
    transactionLimit: optimized ? s.transactionLimit : null,
    targetPrice: optimized && s.targetPrice != null ? s.targetPrice : null,
    recommendation: s.recommendation?.action ?? null,
    moving_avg: s.movingAvg ?? s.recommendation?.movingAvg ?? null,
    isShortlisted: s.isShortlisted ?? false,
    noAutoBuy: s.suppressTradeActions ?? null,
    excludeFromShortlist: s.excludeFromShortlist ?? null,
    enableRSIReversalGate: s.enableRSIReversalGate ?? true,
    rsiPeriod: s.rsiPeriod ?? null,
    rsiOversoldThreshold: s.rsiOversoldThreshold ?? null,
    rsiOverboughtThreshold: s.rsiOverboughtThreshold ?? null,
    rsiHysteresisPoints: s.rsiHysteresisPoints ?? null,
    rsiMinRisingDays: s.rsiMinRisingDays ?? null,
    lotHistory: {
      symbol: s.symbol,
      openLots,
      soldLots,
    },
  };
}

function totals(state: PortfolioSlice) {
  let cost = 0;
  let value = 0;
  for (const s of state.stocks) {
    if (s.quantity <= 0) continue;
    cost += s.quantity * s.averageCost;
    value += s.quantity * snapshotValuationPrice(s);
  }
  const unrealized = value - cost;
  const totalPortfolio = value + state.cashBalance;
  return { total_cost_basis: cost, total_portfolio_value: totalPortfolio, total_unrealized_gain: unrealized };
}

export function portfolioSyncFingerprint(state: PortfolioSlice): string {
  return JSON.stringify({
    c: state.cashBalance,
    st: state.stocks.map((s) => [
      s.symbol,
      s.quantity,
      s.averageCost,
      s.lastPrice,
      s.shortSMA,
      s.dynamicFactor,
      s.pendingOptimization,
      s.stockLimit,
      s.transactionLimit,
      s.targetPrice,
      s.movingAvg ?? s.recommendation?.movingAvg ?? null,
      s.isShortlisted,
      s.suppressTradeActions,
      s.excludeFromShortlist,
      s.enableRSIReversalGate,
      s.rsiPeriod,
      s.rsiOversoldThreshold,
      s.rsiOverboughtThreshold,
      s.rsiHysteresisPoints,
      s.rsiMinRisingDays,
    ]),
    lots: Object.entries(state.lotsBySymbol)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([symbol, lots]) => [
        symbol,
        lots.open.map((lot) => [lot.purchaseDate, lot.quantity, lot.costBasis, lot.status, lot.account ?? "", lot.isRetirementAccount ?? null]),
        lots.sold.map((lot) => [lot.saleDate, lot.quantity, lot.salePrice, lot.realizedGainLoss]),
      ]),
  });
}

/**
 * Saves today's ET-dated snapshot via RPC so holdings are encrypted server-side.
 * Uses `save_portfolio_snapshot` RPC (replaces direct table upsert — columns are
 * now bytea/AES-256-CBC encrypted and cannot be written directly from the client).
 */
export async function upsertPortfolioSnapshotForCloudUser(
  supabase: SupabaseClient,
  dataUserId: string,
  state: PortfolioSlice
): Promise<{ error: Error | null }> {
  const holdings = state.stocks.map((stock) => holdingPayload(stock, state.lotsBySymbol[stock.symbol]));
  const t = totals(state);

  const { error } = await supabase.rpc("save_portfolio_snapshot", {
    p_user_id: dataUserId,
    p_et_calendar_date: etCalendarDateString(),
    p_holdings: holdings,
    p_cash_balance: state.cashBalance,
    p_total_portfolio_value: t.total_portfolio_value,
    p_total_cost_basis: t.total_cost_basis,
    p_total_unrealized_gain: t.total_unrealized_gain,
  });

  if (error) {
    console.warn("[upsertPortfolioSnapshotForCloudUser]", error.message);
    return { error: new Error(error.message) };
  }
  return { error: null };
}

export type GlobalSettings = {
  etfProfitTarget?: number;
  stockProfitTarget?: number;
  riskAppetite?: "Low" | "Medium" | "High";
  enableRiskFilter?: boolean;
  useAISentiment?: boolean;
  useRSIGating?: boolean;
  sellOnlyLongTerm?: boolean;
  limitWatchlistSize?: boolean;
  timezone?: string;
  region?: string;
};

/**
 * Writes the current global settings via SECURITY DEFINER RPC.
 * Using an RPC bypasses the RLS SELECT policy that blocks direct table writes
 * for users whose `users.id` (Google OAuth numeric sub) differs from `auth.uid()`.
 */
export async function saveGlobalSettingsForUser(
  supabase: SupabaseClient,
  userId: string,
  settings: GlobalSettings
): Promise<void> {
  const { error } = await supabase.rpc("set_global_settings", {
    p_user_id: userId,
    p_settings: settings,
  });
  if (error) {
    console.warn("[saveGlobalSettings]", error.message);
  }
}

/**
 * Fetches `users.global_settings` via SECURITY DEFINER RPC.
 * Using an RPC bypasses the RLS SELECT policy that blocks direct table reads
 * for users whose `users.id` (Google OAuth numeric sub) differs from `auth.uid()`.
 * Returns null when no settings are stored yet.
 */
export async function loadGlobalSettingsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<GlobalSettings | null> {
  const { data, error } = await supabase.rpc("get_global_settings", {
    p_user_id: userId,
  });
  if (error) {
    console.warn("[loadGlobalSettings]", error.message);
    return null;
  }
  return (data as GlobalSettings | null) ?? null;
}
