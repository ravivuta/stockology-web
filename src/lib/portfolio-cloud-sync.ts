import type { SupabaseClient } from "@supabase/supabase-js";
import type { SoldLot, StockHolding, TradeLot } from "@/store/portfolioStore";
import { CASH_SYMBOL, CASH_UNIT_PRICE, cashLotQuantity, isCashSymbol } from "@/lib/cash-accounts";
import {
  fixedIncomeSnapshotHoldings,
  fixedIncomeTotal,
  isFixedIncomeSymbol,
  sanitizeFixedIncomeByAccount,
} from "@/lib/fixed-income-accounts";

export type PortfolioSlice = {
  cashBalance: number;
  fixedIncomeByAccount: Record<string, number>;
  stocks: StockHolding[];
  lotsBySymbol: Record<string, { open: TradeLot[]; sold: SoldLot[] }>;
};

function finiteOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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

/** Swift `JSONEncoder.dateEncodingStrategy = .iso8601` (no fractional seconds). */
function iosIso8601(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00Z`;
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function encodeOpenLot(symbol: string, lot: TradeLot): Record<string, unknown> | null {
  const quantity = finiteOrNull(lot.quantity);
  const costBasis = finiteOrNull(lot.costBasis);
  const purchaseDate = iosIso8601(lot.purchaseDate);
  if (quantity == null || quantity <= 0 || costBasis == null || costBasis <= 0 || purchaseDate == null) {
    return null;
  }
  const initialQuantity = finiteOrNull(lot.initialQuantity);
  const payload: Record<string, unknown> = {
    lotId: lot.id,
    symbol,
    purchaseDate,
    costBasis,
    quantity,
    initialQuantity: initialQuantity != null && initialQuantity > 0 ? initialQuantity : quantity,
    status: lot.status || "open",
  };
  const account = lot.account?.trim();
  if (account) payload.account = account;
  if (typeof lot.isRetirementAccount === "boolean") payload.isRetirementAccount = lot.isRetirementAccount;
  return payload;
}

function encodeSoldLot(symbol: string, lot: SoldLot): Record<string, unknown> | null {
  const salePrice = finiteOrNull(lot.salePrice);
  const quantity = finiteOrNull(lot.quantity);
  const realizedGainLoss = finiteOrNull(lot.realizedGainLoss);
  const saleDateIso = iosIso8601(lot.saleDate);
  if (
    salePrice == null ||
    salePrice <= 0 ||
    quantity == null ||
    quantity <= 0 ||
    realizedGainLoss == null ||
    saleDateIso == null
  ) {
    return null;
  }
  const originalCostBasis = salePrice - realizedGainLoss / quantity;
  if (!Number.isFinite(originalCostBasis)) return null;
  return {
    symbol,
    saleDateIntervalSince1970: Date.parse(saleDateIso) / 1000,
    salePrice,
    quantity,
    originalCostBasis,
  };
}

function encodeLotHistory(
  symbol: string,
  lots: { open: TradeLot[]; sold: SoldLot[] } | undefined
): Record<string, unknown> | null {
  const openLots = (lots?.open ?? []).flatMap((lot) => {
    const encoded = encodeOpenLot(symbol, lot);
    return encoded ? [encoded] : [];
  });
  const soldLots = (lots?.sold ?? []).flatMap((lot) => {
    const encoded = encodeSoldLot(symbol, lot);
    return encoded ? [encoded] : [];
  });
  if (openLots.length === 0 && soldLots.length === 0) return null;
  return { symbol, openLots, soldLots };
}

/**
 * Matches iOS `UserPortfolioSnapshot.holdingsJSON` for one equity or watchlist row.
 * Optional keys are omitted when iOS would omit them. `stockLimit` / `transactionLimit`
 * always use the same 10000 / 2500 fallback.
 */
function holdingPayload(s: StockHolding, lots: { open: TradeLot[]; sold: SoldLot[] } | undefined) {
  const symbol = s.symbol.trim().toUpperCase();
  const hasPosition = Number.isFinite(s.quantity) && s.quantity > 0;
  const payload: Record<string, unknown> = {
    symbol,
    quantity: hasPosition ? s.quantity : 0,
    averageCost: hasPosition ? s.averageCost : 0,
    pendingOptimization: s.pendingOptimization === true,
    stockLimit: Number.isFinite(s.stockLimit) ? s.stockLimit : 10_000,
    transactionLimit: Number.isFinite(s.transactionLimit) ? s.transactionLimit : 2_500,
  };
  if ((s.lastPrice ?? 0) > 0) payload.lastPrice = s.lastPrice;
  if (Number.isFinite(s.shortSMA)) payload.shortSMA = Math.round(s.shortSMA);
  if (Number.isFinite(s.dynamicFactor)) payload.dynamicFactor = s.dynamicFactor;
  if (s.targetPrice != null && Number.isFinite(s.targetPrice)) payload.targetPrice = s.targetPrice;
  const movingAvg = s.movingAvg ?? s.recommendation?.movingAvg;
  if (movingAvg != null && Number.isFinite(movingAvg)) payload.moving_avg = movingAvg;
  const lotHistory = encodeLotHistory(symbol, lots);
  if (lotHistory) payload.lotHistory = lotHistory;
  if (s.suppressTradeActions === true) payload.noAutoBuy = true;
  if (s.excludeFromShortlist === true) payload.excludeFromShortlist = true;
  if (s.rsiPeriod != null && Number.isFinite(s.rsiPeriod)) payload.rsiPeriod = Math.round(s.rsiPeriod);
  if (s.rsiOversoldThreshold != null && Number.isFinite(s.rsiOversoldThreshold)) {
    payload.rsiOversoldThreshold = s.rsiOversoldThreshold;
  }
  if (s.rsiOverboughtThreshold != null && Number.isFinite(s.rsiOverboughtThreshold)) {
    payload.rsiOverboughtThreshold = s.rsiOverboughtThreshold;
  }
  if (s.rsiHysteresisPoints != null && Number.isFinite(s.rsiHysteresisPoints)) {
    payload.rsiHysteresisPoints = s.rsiHysteresisPoints;
  }
  if (s.rsiMinRisingDays != null && Number.isFinite(s.rsiMinRisingDays)) {
    payload.rsiMinRisingDays = Math.round(s.rsiMinRisingDays);
  }
  if (typeof s.isETF === "boolean") payload.isETF = s.isETF;
  return payload;
}

function cashSnapshotHolding(lots: { open: TradeLot[]; sold: SoldLot[] } | undefined): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    symbol: CASH_SYMBOL,
    quantity: cashLotQuantity(lots),
    averageCost: CASH_UNIT_PRICE,
    lastPrice: CASH_UNIT_PRICE,
    pendingOptimization: false,
    stockLimit: 10_000,
    transactionLimit: 2_500,
    isETF: false,
  };
  const lotHistory = encodeLotHistory(CASH_SYMBOL, lots);
  if (lotHistory) payload.lotHistory = lotHistory;
  return payload;
}

function iosSnapshotHoldings(state: PortfolioSlice): Record<string, unknown>[] {
  const holdings = state.stocks
    .filter((stock) => !isCashSymbol(stock.symbol) && !isFixedIncomeSymbol(stock.symbol))
    .map((stock) => holdingPayload(stock, state.lotsBySymbol[stock.symbol]));
  holdings.push(cashSnapshotHolding(state.lotsBySymbol[CASH_SYMBOL]));
  holdings.push(...fixedIncomeSnapshotHoldings(state.fixedIncomeByAccount));
  return holdings;
}

function totals(state: PortfolioSlice) {
  let cost = 0;
  let value = 0;
  for (const s of state.stocks) {
    if (isCashSymbol(s.symbol) || isFixedIncomeSymbol(s.symbol) || s.quantity <= 0) continue;
    cost += s.quantity * s.averageCost;
    value += s.quantity * snapshotValuationPrice(s);
  }
  const unrealized = value - cost;
  const totalPortfolio = value + state.cashBalance + fixedIncomeTotal(state.fixedIncomeByAccount);
  return { total_cost_basis: cost, total_portfolio_value: totalPortfolio, total_unrealized_gain: unrealized };
}

export function portfolioSyncFingerprint(state: PortfolioSlice): string {
  return JSON.stringify({
    c: state.cashBalance,
    fi: Object.entries(sanitizeFixedIncomeByAccount(state.fixedIncomeByAccount)).sort(([a], [b]) => a.localeCompare(b)),
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
    fi: Object.entries(sanitizeFixedIncomeByAccount(state.fixedIncomeByAccount)).sort(([a], [b]) => a.localeCompare(b)),
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
  const holdings = iosSnapshotHoldings(state);
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
    fi: Object.entries(sanitizeFixedIncomeByAccount(state.fixedIncomeByAccount)).sort(([a], [b]) => a.localeCompare(b)),
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
export function snapshotSaveBlockReason(
  state: PortfolioSlice,
  options?: { allowEmptyHoldings?: boolean }
): string | null {
  const equity = state.stocks.filter((stock) => !isCashSymbol(stock.symbol) && !isFixedIncomeSymbol(stock.symbol) && stock.quantity > 0);
  const hasCash = Number.isFinite(state.cashBalance) && state.cashBalance >= 0.005;
  const hasFixedIncome = fixedIncomeTotal(state.fixedIncomeByAccount) > 0.005;
  if (equity.length === 0 && !hasCash && !hasFixedIncome && !options?.allowEmptyHoldings) {
    return "empty";
  }
  const t = totals(state);
  if (t.total_portfolio_value < 0) return "negative-total";
  if (state.cashBalance < -100) return "negative-cash";
  if (state.stocks.some((stock) => stock.stockLimit < -100)) return "negative-limits";
  const pricesMissing =
    equity.length > 0 &&
    equity.every((stock) => (stock.lastPrice ?? 0) <= 0 && stock.averageCost <= 0);
  if (pricesMissing) return "prices-not-loaded";
  return null;
}

export async function upsertPortfolioSnapshotForCloudUser(
  supabase: SupabaseClient,
  dataUserId: string,
  state: PortfolioSlice,
  options?: { allowEmptyHoldings?: boolean }
): Promise<{ error: Error | null; skipped?: boolean }> {
  if (snapshotSaveBlockReason(state, options)) {
    return { error: null, skipped: true };
  }
  const holdings = iosSnapshotHoldings(state);
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
  useMarketRegimeCashTilt?: boolean;
  useRSIGating?: boolean;
  rsiPeriod?: number;
  rsiOversoldThreshold?: number;
  rsiOverboughtThreshold?: number;
  rsiHysteresisPoints?: number;
  rsiMinRisingDays?: number;
  sellOnlyLongTerm?: boolean;
  traderModeEnabled?: boolean;
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
  traderModeEnabled?: boolean;
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
    | "traderModeEnabled"
    | "limitWatchlistSize"
    | "timezone"
    | "region"
  >
>;

function numbersDiffer(a: number, b: number): boolean {
  return !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > 1e-9;
}

function resolveCombinedAiSetting(cloud: GlobalSettings): boolean | undefined {
  const ai = cloud.useAISentiment;
  const macro = cloud.useMarketRegimeCashTilt;
  if (ai === true || macro === true) return true;
  if (ai === false) return false;
  return undefined;
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
  const combinedAi = resolveCombinedAiSetting(cloud);
  if (combinedAi != null && combinedAi !== current.useAISentimentForRecommendations) {
    patch.useAISentimentForRecommendations = combinedAi;
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
  if (cloud.traderModeEnabled === false) {
    if (current.traderModeEnabled) patch.traderModeEnabled = false;
    if (current.useAISentimentForRecommendations) patch.useAISentimentForRecommendations = false;
    if (current.useRSIGatingForRecommendations) patch.useRSIGatingForRecommendations = false;
  } else if (cloud.traderModeEnabled === true) {
    if (!current.traderModeEnabled) patch.traderModeEnabled = true;
  } else if ((combinedAi === true || cloud.useRSIGating === true) && !current.traderModeEnabled) {
    patch.traderModeEnabled = true;
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
  const { data: existingData, error: loadError } = await supabase.rpc("get_global_settings", {
    p_user_id: userId,
  });
  if (loadError) {
    console.warn("[saveGlobalSettings/loadExisting]", loadError.message);
  }

  const existing = existingData && typeof existingData === "object" ? (existingData as Record<string, unknown>) : {};
  const nextSettings: GlobalSettings = {
    ...(existing as GlobalSettings),
    ...settings,
  };

  if (settings.useAISentiment != null) {
    // iOS treats company AI sentiment + market-outlook cash tilt as one combined toggle.
    nextSettings.useMarketRegimeCashTilt = settings.useAISentiment;
  }

  const { error } = await supabase.rpc("set_global_settings", {
    p_user_id: userId,
    p_settings: nextSettings,
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
