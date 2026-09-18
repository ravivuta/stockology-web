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
    pendingOptimization: s.pendingOptimization,
    shortSMA: s.shortSMA,
    dynamicFactor: s.dynamicFactor,
    stockLimit: s.stockLimit,
    transactionLimit: s.transactionLimit,
    targetPrice: s.targetPrice ?? null,
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

function holdingIdentityPayload(s: StockHolding, lots: { open: TradeLot[]; sold: SoldLot[] } | undefined) {
  const full = holdingPayload(s, lots);
  return {
    symbol: full.symbol,
    quantity: full.quantity,
    averageCost: full.averageCost,
    lastPrice: full.lastPrice,
    lotHistory: full.lotHistory,
    isETF: s.isETF ?? null,
    noAutoBuy: full.noAutoBuy,
    excludeFromShortlist: full.excludeFromShortlist,
    enableRSIReversalGate: full.enableRSIReversalGate,
    rsiPeriod: full.rsiPeriod,
    rsiOversoldThreshold: full.rsiOversoldThreshold,
    rsiOverboughtThreshold: full.rsiOverboughtThreshold,
    rsiHysteresisPoints: full.rsiHysteresisPoints,
    rsiMinRisingDays: full.rsiMinRisingDays,
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

export function portfolioHoldingsIdentityFingerprint(state: PortfolioSlice): string {
  return JSON.stringify({
    st: state.stocks.map((s) => [
      s.symbol,
      s.quantity,
      s.averageCost,
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

export function portfolioOptimizationFingerprint(state: PortfolioSlice): string {
  return state.stocks
    .map((s) =>
      [
        s.symbol,
        s.shortSMA,
        s.dynamicFactor,
        s.stockLimit,
        s.transactionLimit,
        s.pendingOptimization ? 1 : 0,
        s.targetPrice ?? "",
      ].join(":")
    )
    .sort()
    .join("|");
}

export type SnapshotOptimizationUpdate = {
  symbol: string;
  shortSMA: number;
  dynamicFactor: number;
  stockLimit: number;
  transactionLimit: number;
  pendingOptimization: boolean;
  targetPrice?: number | null;
};

export function optimizationUpdatesFromSlice(
  next: PortfolioSlice,
  prev: PortfolioSlice
): SnapshotOptimizationUpdate[] {
  const prevBySymbol = new Map(prev.stocks.map((stock) => [stock.symbol, stock]));
  return next.stocks.flatMap((stock) => {
    const previous = prevBySymbol.get(stock.symbol);
    if (!previous) return [];
    if (
      previous.shortSMA === stock.shortSMA &&
      previous.dynamicFactor === stock.dynamicFactor &&
      previous.stockLimit === stock.stockLimit &&
      previous.transactionLimit === stock.transactionLimit &&
      previous.pendingOptimization === stock.pendingOptimization &&
      previous.targetPrice === stock.targetPrice
    ) {
      return [];
    }
    return [
      {
        symbol: stock.symbol,
        shortSMA: stock.shortSMA,
        dynamicFactor: stock.dynamicFactor,
        stockLimit: stock.stockLimit,
        transactionLimit: stock.transactionLimit,
        pendingOptimization: stock.pendingOptimization,
        targetPrice: stock.targetPrice ?? null,
      },
    ];
  });
}

export async function patchPortfolioSnapshotOptimizationForCloudUser(
  supabase: SupabaseClient,
  dataUserId: string,
  updates: SnapshotOptimizationUpdate[]
): Promise<{ error: Error | null; patched: boolean }> {
  if (updates.length === 0) return { error: null, patched: true };
  const { data, error } = await supabase.rpc("patch_portfolio_snapshot_optimization", {
    p_user_id: dataUserId,
    p_updates: updates,
  });
  if (error) {
    console.warn("[patchPortfolioSnapshotOptimization]", error.message);
    return { error: new Error(error.message), patched: false };
  }
  return { error: null, patched: data !== false };
}

export async function patchPortfolioSnapshotHoldingsForCloudUser(
  supabase: SupabaseClient,
  dataUserId: string,
  state: PortfolioSlice,
  removedSymbols: string[] = []
): Promise<{ error: Error | null; patched: boolean }> {
  const holdings = state.stocks.map((stock) => holdingIdentityPayload(stock, state.lotsBySymbol[stock.symbol]));
  const { data, error } = await supabase.rpc("patch_portfolio_snapshot_holdings", {
    p_user_id: dataUserId,
    p_holdings: holdings,
    p_removed_symbols: removedSymbols.map((symbol) => symbol.toUpperCase()),
  });
  if (error) {
    console.warn("[patchPortfolioSnapshotHoldings]", error.message);
    return { error: new Error(error.message), patched: false };
  }
  return { error: null, patched: data !== false };
}

export function portfolioHoldingsStructuralFingerprint(state: PortfolioSlice): string {
  return JSON.stringify({
    st: state.stocks.map((s) => [
      s.symbol,
      s.quantity,
      s.averageCost,
      s.shortSMA,
      s.dynamicFactor,
      s.targetPrice,
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

export function portfolioPendingFingerprint(state: PortfolioSlice): string {
  return state.stocks
    .map((s) => `${s.symbol}:${s.pendingOptimization ? 1 : 0}`)
    .sort()
    .join("|");
}

/**
 * Updates snapshot cash and optionally pendingOptimization on existing holding
 * objects. Does not replace SMA, factor, limits, lots, or other stock params.
 */
export async function patchPortfolioSnapshotCashForCloudUser(
  supabase: SupabaseClient,
  dataUserId: string,
  cashBalance: number,
  markPendingOptimization: boolean
): Promise<{ error: Error | null; patched: boolean }> {
  const { data, error } = await supabase.rpc("patch_portfolio_snapshot_cash", {
    p_user_id: dataUserId,
    p_cash_balance: cashBalance,
    p_mark_pending_optimization: markPendingOptimization,
  });
  if (error) {
    console.warn("[patchPortfolioSnapshotCash]", error.message);
    return { error: new Error(error.message), patched: false };
  }
  return { error: null, patched: data !== false };
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
  rsiPeriod?: number;
  rsiOversoldThreshold?: number;
  rsiOverboughtThreshold?: number;
  rsiHysteresisPoints?: number;
  rsiMinRisingDays?: number;
  sellOnlyLongTerm?: boolean;
  limitWatchlistSize?: boolean;
  timezone?: string;
  region?: string;
};

export type AppliedGlobalSettings = {
  etfProfitTarget?: number;
  stockProfitTarget?: number;
  riskAppetite?: "Low" | "Medium" | "High";
  enableRiskFilter?: boolean;
  useAISentimentForRecommendations?: boolean;
  useRSIGatingForRecommendations?: boolean;
  rsiPeriodForRecommendations?: number;
  rsiOversoldThresholdForRecommendations?: number;
  rsiOverboughtThresholdForRecommendations?: number;
  rsiHysteresisPointsForRecommendations?: number;
  rsiMinRisingDaysForRecommendations?: number;
  sellOnlyLongTermQualified?: boolean;
  limitWatchlistSize?: boolean;
  timezone?: string;
  region?: string;
};

type CurrentGlobalSettings = Required<
  Pick<
    AppliedGlobalSettings,
    | "etfProfitTarget"
    | "stockProfitTarget"
    | "riskAppetite"
    | "enableRiskFilter"
    | "useAISentimentForRecommendations"
    | "useRSIGatingForRecommendations"
    | "rsiPeriodForRecommendations"
    | "rsiOversoldThresholdForRecommendations"
    | "rsiOverboughtThresholdForRecommendations"
    | "rsiHysteresisPointsForRecommendations"
    | "rsiMinRisingDaysForRecommendations"
    | "sellOnlyLongTermQualified"
    | "limitWatchlistSize"
    | "timezone"
    | "region"
  >
>;

function numbersDiffer(a: number, b: number): boolean {
  return !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > 1e-9;
}

/** Returns only fields that differ from local settings. Empty object means already in sync. */
export function patchFromCloudGlobalSettings(
  current: CurrentGlobalSettings,
  cloud: GlobalSettings
): AppliedGlobalSettings {
  const patch: AppliedGlobalSettings = {};
  if (cloud.etfProfitTarget != null && cloud.etfProfitTarget > 0 && numbersDiffer(current.etfProfitTarget, cloud.etfProfitTarget)) {
    patch.etfProfitTarget = cloud.etfProfitTarget;
  }
  if (cloud.stockProfitTarget != null && cloud.stockProfitTarget > 0 && numbersDiffer(current.stockProfitTarget, cloud.stockProfitTarget)) {
    patch.stockProfitTarget = cloud.stockProfitTarget;
  }
  if (cloud.riskAppetite != null && cloud.riskAppetite !== current.riskAppetite) {
    patch.riskAppetite = cloud.riskAppetite;
  }
  if (cloud.enableRiskFilter != null && cloud.enableRiskFilter !== current.enableRiskFilter) {
    patch.enableRiskFilter = cloud.enableRiskFilter;
  }
  if (cloud.useAISentiment != null && cloud.useAISentiment !== current.useAISentimentForRecommendations) {
    patch.useAISentimentForRecommendations = cloud.useAISentiment;
  }
  if (cloud.useRSIGating != null && cloud.useRSIGating !== current.useRSIGatingForRecommendations) {
    patch.useRSIGatingForRecommendations = cloud.useRSIGating;
  }
  if (cloud.rsiPeriod != null && cloud.rsiPeriod !== current.rsiPeriodForRecommendations) {
    patch.rsiPeriodForRecommendations = cloud.rsiPeriod;
  }
  if (cloud.rsiOversoldThreshold != null && numbersDiffer(current.rsiOversoldThresholdForRecommendations, cloud.rsiOversoldThreshold)) {
    patch.rsiOversoldThresholdForRecommendations = cloud.rsiOversoldThreshold;
  }
  if (cloud.rsiOverboughtThreshold != null && numbersDiffer(current.rsiOverboughtThresholdForRecommendations, cloud.rsiOverboughtThreshold)) {
    patch.rsiOverboughtThresholdForRecommendations = cloud.rsiOverboughtThreshold;
  }
  if (cloud.rsiHysteresisPoints != null && numbersDiffer(current.rsiHysteresisPointsForRecommendations, cloud.rsiHysteresisPoints)) {
    patch.rsiHysteresisPointsForRecommendations = cloud.rsiHysteresisPoints;
  }
  if (cloud.rsiMinRisingDays != null && cloud.rsiMinRisingDays !== current.rsiMinRisingDaysForRecommendations) {
    patch.rsiMinRisingDaysForRecommendations = cloud.rsiMinRisingDays;
  }
  if (cloud.sellOnlyLongTerm != null && cloud.sellOnlyLongTerm !== current.sellOnlyLongTermQualified) {
    patch.sellOnlyLongTermQualified = cloud.sellOnlyLongTerm;
  }
  if (cloud.limitWatchlistSize != null && cloud.limitWatchlistSize !== current.limitWatchlistSize) {
    patch.limitWatchlistSize = cloud.limitWatchlistSize;
  }
  if (cloud.timezone && cloud.timezone !== current.timezone) {
    patch.timezone = cloud.timezone;
  }
  if (cloud.region && cloud.region !== current.region) {
    patch.region = cloud.region;
  }
  return patch;
}

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
