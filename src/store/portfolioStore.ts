import { create } from "zustand";
import { persist } from "zustand/middleware";
import { calculateTradingLimits, computeRiskReturnScore, recommendedWatchlistSize, stockPassesRiskFilter } from "@/lib/ios-recommendation";
import { getRecommendationHistoryCloses } from "@/lib/recommendation-history-cache";
import { buildRecommendation } from "@/lib/recommendation";
import type { CsvImportRow, CsvImportTrade } from "@/lib/csvPortfolio";
import { buildTradeJournalFromLots } from "@/lib/trade-journal-from-lots";
import { analystTargetUpsidePct } from "@/lib/marketFormat";
import { loadHistoricalPayloadForSymbol } from "@/lib/historical-price-client";

export type LotStatus = "open" | "partiallySold" | "fullySold" | "washSaleRestricted";

export type TradeLot = {
  id: string;
  quantity: number;
  costBasis: number;
  purchaseDate: string;
  account?: string;
  isRetirementAccount?: boolean | null;
  status: LotStatus;
};

export type SoldLot = {
  saleDate: string;
  quantity: number;
  salePrice: number;
  realizedGainLoss: number;
};

/** One recorded trade — used for history and LIFO undo. */
export type TradeJournalEntry = {
  id: string;
  createdAt: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  tradeDate: string;
  cashBefore: number;
  quantityBefore: number;
  averageCostBefore: number;
  lastPriceBefore: number;
  /** Open lot id added on BUY (remove on undo). */
  lotId?: string;
  /** False when rebuilt from tax lots (cloud sync); undo is not supported for that row. */
  undoable?: boolean;
};

export type StockHolding = {
  symbol: string;
  name?: string;
  quantity: number;
  averageCost: number;
  shortSMA: number;
  dynamicFactor: number;
  stockLimit: number;
  transactionLimit: number;
  targetPrice?: number;
  pendingOptimization: boolean;
  lastPrice?: number;
  dailyChangePercent?: number;
  recommendation?: {
    action: string;
    comments: string;
    nextBuyPrice: number;
    movingAvg: number;
    expectedReturnPct: number;
  };
  score?: number;
  isShortlisted?: boolean;
  isVisibleInRisk?: boolean;
  isInWatchlistSize?: boolean;
  aiSentimentScore?: number;
  aiSentimentLastUpdated?: string; // ISO8601 timestamp
  beta?: number;
  marketCap?: number;
  peg?: number;
  analystTarget?: number;
  analystAvg?: string;
  isETF?: boolean;
  /** Precomputed SMA for user's period (e.g. from iOS snapshot `moving_avg`). */
  movingAvg?: number;
  suppressTradeActions?: boolean;
  excludeFromShortlist?: boolean;
  enableRSIReversalGate?: boolean;
  rsiPeriod?: number;
  rsiOversoldThreshold?: number;
  rsiOverboughtThreshold?: number;
  rsiHysteresisPoints?: number;
  rsiMinRisingDays?: number;
};

type State = {
  cashBalance: number;
  portfolioSize: number;
  riskAppetite: "Low" | "Medium" | "High";
  enableRiskFilter: boolean;
  limitWatchlistSize: boolean;
  etfProfitTarget: number;
  stockProfitTarget: number;
  useAISentimentForRecommendations: boolean;
  useRSIGatingForRecommendations: boolean;
  sellOnlyLongTermQualified: boolean;
  timezone: string;
  region: string;
  stocks: StockHolding[];
  lotsBySymbol: Record<string, { open: TradeLot[]; sold: SoldLot[] }>;
  /** Newest last — undo only the most recent entry to keep state consistent. */
  tradeJournal: TradeJournalEntry[];
  onboardingComplete: boolean;
  optimizing: boolean;
  lastRefreshAt: string | null;
  lastLocalMutationAt: string | null;
  clearCachesOnReset: () => void;
  setCash: (n: number) => void;
  setSettings: (p: Partial<Pick<State, "riskAppetite" | "enableRiskFilter" | "limitWatchlistSize" | "etfProfitTarget" | "stockProfitTarget" | "useAISentimentForRecommendations" | "useRSIGatingForRecommendations" | "sellOnlyLongTermQualified" | "timezone" | "region">>) => void;
  addStock: (s: Partial<StockHolding> & { symbol: string }) => void;
  /** Merge fields into an existing symbol and rebuild recommendation. */
  updateStock: (symbol: string, patch: Partial<StockHolding>) => void;
  bulkUpdateStocks: (patches: { symbol: string; patch: Partial<StockHolding> }[]) => void;
  editOpenLot: (
    symbol: string,
    lotId: string,
    updates: {
      purchaseDate: string;
      quantity: number;
      costBasis: number;
      account?: string;
      isRetirementAccount?: boolean | null;
    }
  ) => void;
  removeOpenLot: (symbol: string, lotId: string) => void;
  removeStock: (symbol: string) => void;
  recordTrade: (
    symbol: string,
    side: "BUY" | "SELL",
    qty: number,
    price: number,
    date: string,
    options?: { account?: string; isRetirementAccount?: boolean | null }
  ) => void;
  recordSellFromLot: (symbol: string, lotId: string, qty: number, price: number, date: string) => void;
  /** Reverses the last journal entry only. Returns false if nothing to undo. */
  undoLastTrade: () => boolean;
  recalcMetrics: () => void;
  clearAllHoldingsKeepingWatchlist: () => void;
  resetAll: () => void;
  setOptimizing: (v: boolean) => void;
  setOnboardingComplete: (v: boolean) => void;
  optimizeStock: (symbol: string) => Promise<{ ok: boolean; error?: string }>;
  optimizePendingStocks: () => Promise<void>;
  importCsvRows: (
    rows: CsvImportRow[],
    mode: "portfolio" | "watchlist",
    trades?: CsvImportTrade[]
  ) => {
    importType: "holdings" | "watchlist";
    importedSymbols: string[];
    importedCount: number;
    addedCount: number;
    prunedWatchlistCount: number;
    importedTradeCount: number;
    netUpdates: Array<{ symbol: string; action: "BUY" | "SELL"; qty: number }>;
    liquidationCashCredited: number;
    cashAdjustedBy: number;
  };
  /** Replace local portfolio from a cloud snapshot (e.g. mobile sync). Recomputes recommendations. */
  replaceFromCloudSync: (payload: {
    cashBalance: number;
    stocks: StockHolding[];
    lotsBySymbol: Record<string, { open: TradeLot[]; sold: SoldLot[] }>;
    onboardingComplete: boolean;
  }) => void;
};

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function defaultImportPurchaseDate(): string {
  return new Date().toISOString().slice(0, 10);
}

type OptimizedStrategyPayload = {
  shortSMA: number;
  dynamicFactor: number;
  stockLimit: number;
  transactionLimit: number;
  pendingOptimization: boolean;
};

function countValidHistoricalCloses(history: { close?: number | null }[]): number {
  return history.reduce((count, point) => {
    const close = Number(point.close);
    return Number.isFinite(close) && close > 0 ? count + 1 : count;
  }, 0);
}

// Incremented whenever an import starts, causing any in-flight optimizePendingStocks
// loop to abort after its current in-progress fetch completes.
let optimizationGeneration = 0;

function preserveImportedMetadata(existing: StockHolding | undefined) {
  if (!existing) return {};
  return {
    dailyChangePercent: existing.dailyChangePercent,
    score: existing.score,
    isShortlisted: existing.isShortlisted,
    isVisibleInRisk: existing.isVisibleInRisk,
    isInWatchlistSize: existing.isInWatchlistSize,
    aiSentimentScore: existing.aiSentimentScore,
    beta: existing.beta,
    marketCap: existing.marketCap,
    peg: existing.peg,
    analystTarget: existing.analystTarget,
    analystAvg: existing.analystAvg,
    isETF: existing.isETF,
    movingAvg: existing.movingAvg,
    suppressTradeActions: existing.suppressTradeActions,
    excludeFromShortlist: existing.excludeFromShortlist,
    enableRSIReversalGate: existing.enableRSIReversalGate,
    rsiPeriod: existing.rsiPeriod,
    rsiOversoldThreshold: existing.rsiOversoldThreshold,
    rsiOverboughtThreshold: existing.rsiOverboughtThreshold,
    rsiHysteresisPoints: existing.rsiHysteresisPoints,
    rsiMinRisingDays: existing.rsiMinRisingDays,
  } satisfies Partial<StockHolding>;
}

function buildImportedOpenLots(rows: CsvImportRow[]): {
  totalQty: number;
  averageCost: number;
  template: CsvImportRow;
  openLots: TradeLot[];
} {
  let totalQty = 0;
  let totalBasis = 0;
  const openLots: TradeLot[] = [];

  for (const row of rows) {
    const qty = Math.max(0, row.qty);
    const price = Math.max(0, row.price);
    if (qty <= 0) continue;

    totalQty += qty;
    totalBasis += qty * price;
    openLots.push({
      id: uid(),
      quantity: qty,
      costBasis: price,
      purchaseDate: row.purchaseDate || defaultImportPurchaseDate(),
      account: row.account?.trim() || "",
      isRetirementAccount: row.isRetirementAccount ?? null,
      status: "open",
    });
  }

  return {
    totalQty,
    averageCost: totalQty > 0 ? totalBasis / totalQty : 0,
    template: rows[rows.length - 1],
    openLots: openLots.sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate)),
  };
}

function cloneTradeLot(lot: TradeLot): TradeLot {
  return { ...lot };
}

function cloneSoldLot(lot: SoldLot): SoldLot {
  return { ...lot };
}

type RecalcContext = {
  etfProfitTarget: number;
  stockProfitTarget: number;
  useAISentimentForRecommendations: boolean;
  useRSIGatingForRecommendations: boolean;
  sellOnlyLongTermQualified: boolean;
  lotsBySymbol: Record<string, { open: TradeLot[]; sold: SoldLot[] }>;
};

type ShortlistContext = Pick<State, "riskAppetite" | "enableRiskFilter" | "limitWatchlistSize">;
type DeriveOptions = {
  shouldRecalculateLimits?: boolean;
  forceRecalculateAllHoldingLimits?: boolean;
};

async function requestOptimizedStrategy(
  stock: StockHolding,
  state: Pick<
    State,
    | "portfolioSize"
    | "etfProfitTarget"
    | "stockProfitTarget"
    | "useRSIGatingForRecommendations"
  >
): Promise<OptimizedStrategyPayload> {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const history = await loadHistoricalPayloadForSymbol(stock.symbol, 252 * 5 + 280);
  if (countValidHistoricalCloses(history) < 252) {
    throw new Error(`Insufficient historical data for ${stock.symbol}. Need about 1 year of daily closes.`);
  }

  const response = await fetch(`${basePath}/api/python/optimization`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol: stock.symbol,
      history,
      quantity: stock.quantity,
      averageCost: stock.averageCost,
      analystTarget: stock.analystTarget,
      analystAvg: stock.analystAvg,
      marketCap: stock.marketCap,
      peg: stock.peg,
      isETF: stock.isETF,
      rsiPeriod: stock.rsiPeriod,
      rsiOversoldThreshold: stock.rsiOversoldThreshold,
      rsiOverboughtThreshold: stock.rsiOverboughtThreshold,
      rsiHysteresisPoints: stock.rsiHysteresisPoints,
      rsiMinRisingDays: stock.rsiMinRisingDays,
      portfolioSize: state.portfolioSize,
      watchlistCount: recommendedWatchlistSize(state.portfolioSize),
      etfProfitTargetPercent: state.etfProfitTarget,
      stockProfitTargetPercent: state.stockProfitTarget,
      useRSIGating: state.useRSIGatingForRecommendations,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string; strategy?: OptimizedStrategyPayload }
    | null;

  if (!response.ok || !payload?.strategy) {
    throw new Error(payload?.error || `Optimization failed for ${stock.symbol}`);
  }

  return payload.strategy;
}

function reduceOpenLotsFifo(openLots: TradeLot[], qtyToSell: number): TradeLot[] {
  let remaining = qtyToSell;
  const next = [...openLots]
    .map((lot) => ({ ...lot }))
    .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));

  for (let i = 0; i < next.length && remaining > 0; i += 1) {
    const lot = next[i];
    const sellQty = Math.min(remaining, lot.quantity);
    lot.quantity -= sellQty;
    lot.status = lot.quantity <= 1e-6 ? "fullySold" : "partiallySold";
    remaining -= sellQty;
  }

  return next
    .filter((lot) => lot.quantity > 1e-6)
    .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
}

function reduceOpenLotById(openLots: TradeLot[], lotId: string, qtyToSell: number): TradeLot[] {
  const next = openLots.map((lot) => ({ ...lot }));
  const target = next.find((lot) => lot.id === lotId);
  if (!target) return next;

  const sellQty = Math.min(qtyToSell, Math.max(0, target.quantity));
  target.quantity -= sellQty;
  target.status = target.quantity <= 1e-6 ? "fullySold" : "partiallySold";

  return next
    .filter((lot) => lot.quantity > 1e-6)
    .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
}

function summarizeOpenLots(openLots: TradeLot[]) {
  const totalQty = openLots.reduce((sum, lot) => sum + Math.max(0, lot.quantity), 0);
  const totalBasis = openLots.reduce((sum, lot) => sum + Math.max(0, lot.quantity) * Math.max(0, lot.costBasis), 0);
  return {
    quantity: totalQty,
    averageCost: totalQty > 0 ? totalBasis / totalQty : 0,
  };
}

function normalizeAccountKey(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

/** Risk–return score + iOS-aligned recommendation (same as `RecommendationEngine` + `calculateScore`). */
function recalcHolding(
  s: StockHolding,
  ctx: RecalcContext
): StockHolding {
  const score = s.isETF ? undefined : computeRiskReturnScore(s);
  const next = { ...s, score };
  const lots = ctx.lotsBySymbol[s.symbol] ?? { open: [], sold: [] };
  return {
    ...next,
    recommendation: buildRecommendation(next, {
      closes: getRecommendationHistoryCloses(next.symbol),
      etfProfitTarget: ctx.etfProfitTarget,
      stockProfitTarget: ctx.stockProfitTarget,
      useAISentiment: ctx.useAISentimentForRecommendations,
      useRSIGating: ctx.useRSIGatingForRecommendations,
      sellOnlyLongTermQualified: ctx.sellOnlyLongTermQualified,
      openLots: lots.open,
      soldLots: lots.sold,
    }),
  };
}

function derivePortfolioState(
  stocksInput: StockHolding[],
  cashBalance: number,
  recalcCtx: RecalcContext,
  shortlistCtx: ShortlistContext,
  options?: DeriveOptions
): { stocks: StockHolding[]; portfolioSize: number } {
  const shouldRecalculateLimits = options?.shouldRecalculateLimits ?? true;

  const scoredStocks = stocksInput.map((stock) => ({
    ...stock,
    score: stock.isETF ? undefined : computeRiskReturnScore(stock),
  }));
  const portfolioSize = scoredStocks.reduce((sum, stock) => sum + stock.quantity * (stock.lastPrice ?? 0), 0) + cashBalance;
  const idealWatchlistSize = recommendedWatchlistSize(portfolioSize);

  let stocksWithLimits = scoredStocks;
  if (shouldRecalculateLimits) {
    const recommendedWatchlistSizeForLimits = shortlistCtx.limitWatchlistSize
      ? idealWatchlistSize
      : Math.max(
          stocksWithLimits.filter((stock) => {
            if (stock.excludeFromShortlist === true) return false;
            if (stock.quantity > 0 || stock.isETF === true) return true;
            if (shortlistCtx.enableRiskFilter) {
              return stockPassesRiskFilter(
                stock,
                shortlistCtx.riskAppetite,
                shortlistCtx.enableRiskFilter,
                analystTargetUpsidePct(stock.lastPrice, stock.analystTarget)
              );
            }
            return true;
          }).length,
          1
        );

    stocksWithLimits = stocksWithLimits.map((stock) => {
      const limits = calculateTradingLimits(
        portfolioSize,
        stock.isETF,
        stock.score,
        recommendedWatchlistSizeForLimits,
        stock.marketCap,
        stock.beta
      );
      return {
        ...stock,
        stockLimit: limits.stockLimit,
        transactionLimit: limits.transactionLimit,
      };
    });
  }

  const recalcedStocks = stocksWithLimits.map((s) => recalcHolding(s, recalcCtx));

  const stocksWithRisk = recalcedStocks.map((stock) => ({
    ...stock,
    isVisibleInRisk: stockPassesRiskFilter(
      stock,
      shortlistCtx.riskAppetite,
      shortlistCtx.enableRiskFilter,
      analystTargetUpsidePct(stock.lastPrice, stock.analystTarget)
    ),
  }));

  const shortlistedSymbols = new Set<string>();

  if (shortlistCtx.limitWatchlistSize) {
    const holdingSymbols = stocksWithRisk.filter((stock) => stock.quantity > 0 && stock.excludeFromShortlist !== true);
    const unownedEtfs = stocksWithRisk.filter((stock) => stock.quantity <= 0 && stock.isETF === true && stock.excludeFromShortlist !== true);
    const eligibleOthers = stocksWithRisk
      .filter((stock) => stock.quantity <= 0 && stock.isETF !== true && stock.isVisibleInRisk && stock.excludeFromShortlist !== true)
      .filter((stock) => (stock.lastPrice ?? 0) < stock.transactionLimit)
      .sort((a, b) => {
        const cmp = (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY);
        return cmp === 0 ? a.symbol.localeCompare(b.symbol) : cmp;
      });

    for (const stock of holdingSymbols) shortlistedSymbols.add(stock.symbol);
    for (const stock of unownedEtfs) shortlistedSymbols.add(stock.symbol);

    const remainingSlots = idealWatchlistSize - holdingSymbols.length;
    if (remainingSlots > 0) {
      for (const stock of eligibleOthers.slice(0, remainingSlots)) {
        shortlistedSymbols.add(stock.symbol);
      }
    }
  } else {
    for (const stock of stocksWithRisk) {
      if (stock.excludeFromShortlist === true) continue;
      if (stock.quantity > 0 || stock.isETF === true || stock.isVisibleInRisk) {
        shortlistedSymbols.add(stock.symbol);
      }
    }
  }

  const stocks = stocksWithRisk.map((stock) => {
    const isShortlisted = shortlistedSymbols.has(stock.symbol);
    return {
      ...stock,
      isShortlisted,
      isInWatchlistSize: isShortlisted,
      recommendation: isShortlisted ? stock.recommendation : undefined,
    };
  });

  return { stocks, portfolioSize };
}

const defaultStock = (partial: Partial<StockHolding> & { symbol: string }): StockHolding => ({
  symbol: partial.symbol,
  name: partial.name,
  quantity: partial.quantity ?? 0,
  averageCost: partial.averageCost ?? 0,
  shortSMA: partial.shortSMA ?? 50,
  dynamicFactor: partial.dynamicFactor ?? 20,
  stockLimit: partial.stockLimit ?? 10000,
  transactionLimit: partial.transactionLimit ?? 2500,
  targetPrice: partial.targetPrice,
  pendingOptimization: partial.pendingOptimization ?? true,
  lastPrice: partial.lastPrice ?? partial.averageCost ?? 100,
  dailyChangePercent: partial.dailyChangePercent ?? 0,
  score: partial.score,
  isShortlisted: partial.isShortlisted ?? false,
  isVisibleInRisk: partial.isVisibleInRisk ?? false,
  isInWatchlistSize: partial.isInWatchlistSize ?? false,
  analystTarget: partial.analystTarget,
  analystAvg: partial.analystAvg ?? "4.2",
  beta: partial.beta ?? 1.1,
  marketCap: partial.marketCap,
  peg: partial.peg ?? 1.5,
  isETF: partial.isETF ?? false,
  movingAvg: partial.movingAvg,
  suppressTradeActions: partial.suppressTradeActions ?? false,
  excludeFromShortlist: partial.excludeFromShortlist ?? false,
  enableRSIReversalGate: partial.enableRSIReversalGate ?? true,
  rsiPeriod: partial.rsiPeriod ?? 14,
  rsiOversoldThreshold: partial.rsiOversoldThreshold ?? 30,
  rsiOverboughtThreshold: partial.rsiOverboughtThreshold ?? 70,
  rsiHysteresisPoints: partial.rsiHysteresisPoints ?? 5,
  rsiMinRisingDays: partial.rsiMinRisingDays ?? 2,
  recommendation: undefined,
});

export const usePortfolioStore = create<State>()(
  persist(
    (set, get) => ({
      cashBalance: 0,
      portfolioSize: 0,
      riskAppetite: "Medium",
      enableRiskFilter: true,
      limitWatchlistSize: true,
      etfProfitTarget: 50,
      stockProfitTarget: 50,
      useAISentimentForRecommendations: false,
      useRSIGatingForRecommendations: false,
      sellOnlyLongTermQualified: false,
      timezone: "America/New_York",
      region: "US",
      stocks: [],
      lotsBySymbol: {},
      tradeJournal: [],
      onboardingComplete: false,
      optimizing: false,
      lastRefreshAt: null,
      lastLocalMutationAt: null,
      clearCachesOnReset: () => {
        if (typeof window !== "undefined") {
          localStorage.removeItem("stocks-pm-portfolio");
        }
      },
      setCash: (n) =>
        set((st) => {
          const mutationAt = new Date().toISOString();
          const recalcCtx: RecalcContext = {
            etfProfitTarget: st.etfProfitTarget,
            stockProfitTarget: st.stockProfitTarget,
            useAISentimentForRecommendations: st.useAISentimentForRecommendations,
            useRSIGatingForRecommendations: st.useRSIGatingForRecommendations,
            sellOnlyLongTermQualified: st.sellOnlyLongTermQualified,
            lotsBySymbol: st.lotsBySymbol,
          };
          const currentPortfolioSize = st.stocks.reduce((sum, s) => sum + s.quantity * (s.lastPrice ?? 0), 0) + st.cashBalance;
          const newPortfolioSize = st.stocks.reduce((sum, s) => sum + s.quantity * (s.lastPrice ?? 0), 0) + n;
          const drift = currentPortfolioSize > 0 ? Math.abs(newPortfolioSize - currentPortfolioSize) / currentPortfolioSize : 0;
          const derived = derivePortfolioState(st.stocks, n, recalcCtx, st, {
            shouldRecalculateLimits: true,
            forceRecalculateAllHoldingLimits: drift > 0.10,
          });
          return {
            cashBalance: n,
            stocks: derived.stocks,
            portfolioSize: derived.portfolioSize,
            lastLocalMutationAt: mutationAt,
          };
        }),
      setSettings: (p) =>
        set((st) => {
          const mutationAt = new Date().toISOString();
          const nextState = { ...st, ...p };
          const ctx: RecalcContext = {
            etfProfitTarget: nextState.etfProfitTarget,
            stockProfitTarget: nextState.stockProfitTarget,
            useAISentimentForRecommendations: nextState.useAISentimentForRecommendations,
            useRSIGatingForRecommendations: nextState.useRSIGatingForRecommendations,
            sellOnlyLongTermQualified: nextState.sellOnlyLongTermQualified,
            lotsBySymbol: st.lotsBySymbol,
          };
          const derived = derivePortfolioState(st.stocks, st.cashBalance, ctx, nextState, {
            shouldRecalculateLimits: true,
            forceRecalculateAllHoldingLimits:
              p.limitWatchlistSize != null && p.limitWatchlistSize !== st.limitWatchlistSize,
          });
          return { ...p, stocks: derived.stocks, portfolioSize: derived.portfolioSize, lastLocalMutationAt: mutationAt };
        }),
      addStock: (s) =>
        set((st) => {
          const mutationAt = new Date().toISOString();
          const ctx: RecalcContext = {
            etfProfitTarget: st.etfProfitTarget,
            stockProfitTarget: st.stockProfitTarget,
            useAISentimentForRecommendations: st.useAISentimentForRecommendations,
            useRSIGatingForRecommendations: st.useRSIGatingForRecommendations,
            sellOnlyLongTermQualified: st.sellOnlyLongTermQualified,
            lotsBySymbol: st.lotsBySymbol,
          };
          const stocks = [...st.stocks.filter((x) => x.symbol !== s.symbol.toUpperCase()), defaultStock({ ...s, symbol: s.symbol.toUpperCase() })];
          const derived = derivePortfolioState(stocks, st.cashBalance, ctx, st);
          return { stocks: derived.stocks, portfolioSize: derived.portfolioSize, lastLocalMutationAt: mutationAt };
        }),
      updateStock: (symbol, patch) =>
        set((st) => {
          const sym = symbol.toUpperCase();
          const mutationAt = new Date().toISOString();
          const ctx: RecalcContext = {
            etfProfitTarget: st.etfProfitTarget,
            stockProfitTarget: st.stockProfitTarget,
            useAISentimentForRecommendations: st.useAISentimentForRecommendations,
            useRSIGatingForRecommendations: st.useRSIGatingForRecommendations,
            sellOnlyLongTermQualified: st.sellOnlyLongTermQualified,
            lotsBySymbol: st.lotsBySymbol,
          };
          const stocks = st.stocks.map((s) => {
            if (s.symbol !== sym) return s;
            return { ...s, ...patch, symbol: sym };
          });
          const derived = derivePortfolioState(stocks, st.cashBalance, ctx, st);
          return { stocks: derived.stocks, portfolioSize: derived.portfolioSize, lastLocalMutationAt: mutationAt };
        }),
      bulkUpdateStocks: (patches) =>
        set((st) => {
          if (patches.length === 0) return {};
          const patchMap = new Map<string, Partial<StockHolding>>();
          for (const item of patches) {
            const symbol = item.symbol.trim().toUpperCase();
            if (!symbol || Object.keys(item.patch).length === 0) continue;
            const prev = patchMap.get(symbol);
            patchMap.set(symbol, prev ? { ...prev, ...item.patch } : item.patch);
          }
          if (patchMap.size === 0) return {};

          const ctx: RecalcContext = {
            etfProfitTarget: st.etfProfitTarget,
            stockProfitTarget: st.stockProfitTarget,
            useAISentimentForRecommendations: st.useAISentimentForRecommendations,
            useRSIGatingForRecommendations: st.useRSIGatingForRecommendations,
            sellOnlyLongTermQualified: st.sellOnlyLongTermQualified,
            lotsBySymbol: st.lotsBySymbol,
          };
          const stocks = st.stocks.map((stock) => {
            const patch = patchMap.get(stock.symbol);
            if (!patch) return stock;
            return { ...stock, ...patch, symbol: stock.symbol };
          });
          const derived = derivePortfolioState(stocks, st.cashBalance, ctx, st);
          return { stocks: derived.stocks, portfolioSize: derived.portfolioSize };
        }),
      editOpenLot: (symbol, lotId, updates) =>
        set((st) => {
          const sym = symbol.trim().toUpperCase();
          const quantity = Number(updates.quantity);
          const costBasis = Number(updates.costBasis);
          const purchaseDate = updates.purchaseDate.trim();
          if (!sym || !lotId || quantity <= 0 || !Number.isFinite(quantity) || costBasis <= 0 || !Number.isFinite(costBasis) || !purchaseDate) {
            return {};
          }

          const existing = st.stocks.find((item) => item.symbol === sym);
          if (!existing) return {};

          const bundle = st.lotsBySymbol[sym];
          if (!bundle || bundle.open.length === 0) return {};

          const openLots = bundle.open.map((lot) =>
            lot.id === lotId
              ? {
                  ...lot,
                  purchaseDate,
                  quantity,
                  costBasis,
                  account: updates.account?.trim() || "",
                  isRetirementAccount:
                    updates.isRetirementAccount == null ? null : Boolean(updates.isRetirementAccount),
                }
              : lot
          );
          if (!openLots.some((lot) => lot.id === lotId)) return {};

          openLots.sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
          const lots = {
            ...st.lotsBySymbol,
            [sym]: {
              open: openLots,
              sold: bundle.sold.map((lot) => ({ ...lot })),
            },
          };
          const syncedHolding = summarizeOpenLots(openLots);
          const mutationAt = new Date().toISOString();
          const ctx: RecalcContext = {
            etfProfitTarget: st.etfProfitTarget,
            stockProfitTarget: st.stockProfitTarget,
            useAISentimentForRecommendations: st.useAISentimentForRecommendations,
            useRSIGatingForRecommendations: st.useRSIGatingForRecommendations,
            sellOnlyLongTermQualified: st.sellOnlyLongTermQualified,
            lotsBySymbol: lots,
          };
          const stocks = st.stocks.map((item) =>
            item.symbol === sym
              ? {
                  ...item,
                  quantity: syncedHolding.quantity,
                  averageCost: syncedHolding.quantity > 0 ? syncedHolding.averageCost : item.averageCost,
                }
              : item
          );
          const derived = derivePortfolioState(stocks, st.cashBalance, ctx, st);
          return {
            stocks: derived.stocks,
            lotsBySymbol: lots,
            portfolioSize: derived.portfolioSize,
            lastLocalMutationAt: mutationAt,
          };
        }),
      removeOpenLot: (symbol, lotId) =>
        set((st) => {
          const sym = symbol.trim().toUpperCase();
          if (!sym || !lotId) return {};

          const existing = st.stocks.find((item) => item.symbol === sym);
          if (!existing) return {};

          const bundle = st.lotsBySymbol[sym];
          if (!bundle || bundle.open.length === 0) return {};

          const openLots = bundle.open.filter((lot) => lot.id !== lotId);
          if (openLots.length === bundle.open.length) return {};

          const lots = {
            ...st.lotsBySymbol,
            [sym]: {
              open: openLots.sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate)),
              sold: bundle.sold.map((lot) => ({ ...lot })),
            },
          };

          const syncedHolding = summarizeOpenLots(openLots);
          const mutationAt = new Date().toISOString();
          const ctx: RecalcContext = {
            etfProfitTarget: st.etfProfitTarget,
            stockProfitTarget: st.stockProfitTarget,
            useAISentimentForRecommendations: st.useAISentimentForRecommendations,
            useRSIGatingForRecommendations: st.useRSIGatingForRecommendations,
            sellOnlyLongTermQualified: st.sellOnlyLongTermQualified,
            lotsBySymbol: lots,
          };
          const stocks = st.stocks.map((item) =>
            item.symbol === sym
              ? {
                  ...item,
                  quantity: syncedHolding.quantity,
                  averageCost: syncedHolding.quantity > 0 ? syncedHolding.averageCost : item.averageCost,
                }
              : item
          );
          const derived = derivePortfolioState(stocks, st.cashBalance, ctx, st);
          return {
            stocks: derived.stocks,
            lotsBySymbol: lots,
            portfolioSize: derived.portfolioSize,
            lastLocalMutationAt: mutationAt,
          };
        }),
      removeStock: (symbol) =>
        set((st) => {
          const mutationAt = new Date().toISOString();
          const stocks = st.stocks.filter((s) => s.symbol !== symbol);
          const lots = { ...st.lotsBySymbol };
          delete lots[symbol];
          const ctx: RecalcContext = {
            etfProfitTarget: st.etfProfitTarget,
            stockProfitTarget: st.stockProfitTarget,
            useAISentimentForRecommendations: st.useAISentimentForRecommendations,
            useRSIGatingForRecommendations: st.useRSIGatingForRecommendations,
            sellOnlyLongTermQualified: st.sellOnlyLongTermQualified,
            lotsBySymbol: lots,
          };
          const derived = derivePortfolioState(stocks, st.cashBalance, ctx, st);
          return {
            stocks: derived.stocks,
            lotsBySymbol: lots,
            portfolioSize: derived.portfolioSize,
            lastLocalMutationAt: mutationAt,
          };
        }),
      recordTrade: (symbol, side, qty, price, date, options) => {
        if (qty <= 0 || !Number.isFinite(price)) return;
        const sym = symbol.toUpperCase();
        set((st) => {
          const mutationAt = new Date().toISOString();
          const existing = st.stocks.find((s) => s.symbol === sym);
          const cashBefore = st.cashBalance;
          const journalBase = {
            id: uid(),
            createdAt: new Date().toISOString(),
            symbol: sym,
            quantity: qty,
            price,
            tradeDate: date,
            cashBefore,
            quantityBefore: existing?.quantity ?? 0,
            averageCostBefore: existing?.averageCost ?? 0,
            lastPriceBefore: existing?.lastPrice ?? price,
          };

          if (side === "BUY") {
            const cost = qty * price;
            const newCash = cashBefore - cost;
            const lotId = uid();
            const lots = { ...st.lotsBySymbol };
            const cur = { ...(lots[sym] || { open: [], sold: [] }) };
            cur.open = [
              ...cur.open,
              {
                id: lotId,
                quantity: qty,
                costBasis: price,
                purchaseDate: date,
                account: options?.account?.trim() || "",
                isRetirementAccount: options?.isRetirementAccount ?? null,
                status: "open" as const,
              },
            ].sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
            lots[sym] = cur;
            const ctx: RecalcContext = {
              etfProfitTarget: st.etfProfitTarget,
              stockProfitTarget: st.stockProfitTarget,
              useAISentimentForRecommendations: st.useAISentimentForRecommendations,
              useRSIGatingForRecommendations: st.useRSIGatingForRecommendations,
              sellOnlyLongTermQualified: st.sellOnlyLongTermQualified,
              lotsBySymbol: lots,
            };
            let stocks: StockHolding[];
            if (!existing) {
              stocks = [
                ...st.stocks,
                defaultStock({
                  symbol: sym,
                  quantity: qty,
                  averageCost: price,
                  lastPrice: price,
                  excludeFromShortlist: false,
                  pendingOptimization: true,
                }),
              ];
            } else {
              stocks = st.stocks.map((s) => {
                if (s.symbol !== sym) return s;
                const q0 = s.quantity;
                const avg0 = s.averageCost;
                  const costBasis = q0 * avg0 + qty * price;
                  const q1 = q0 + qty;
                  const avg1 = q1 > 0 ? costBasis / q1 : 0;
                  return { ...s, quantity: q1, averageCost: avg1, lastPrice: price, excludeFromShortlist: false };
                });
            }
            const entry: TradeJournalEntry = { ...journalBase, side: "BUY", lotId };
            const journal = [...st.tradeJournal, entry].slice(-200);
            const derived = derivePortfolioState(stocks, newCash, ctx, st);
            return {
              stocks: derived.stocks,
              lotsBySymbol: lots,
              cashBalance: newCash,
              tradeJournal: journal,
              portfolioSize: derived.portfolioSize,
              lastLocalMutationAt: mutationAt,
            };
          }

          /* SELL */
          if (!existing || existing.quantity <= 0) return {};
          const sellQty = Math.min(qty, existing.quantity);
          const avgBefore = existing.averageCost;
          const realizedGainLoss = (price - avgBefore) * sellQty;
          const proceeds = sellQty * price;
          const newCash = cashBefore + proceeds;
          const lots = { ...st.lotsBySymbol };
          const cur = { ...(lots[sym] || { open: [], sold: [] }) };
          cur.open = reduceOpenLotsFifo(cur.open, sellQty);
          cur.sold.unshift({
            saleDate: date,
            quantity: sellQty,
            salePrice: price,
            realizedGainLoss,
          });
          lots[sym] = cur;
          const ctx: RecalcContext = {
            etfProfitTarget: st.etfProfitTarget,
            stockProfitTarget: st.stockProfitTarget,
            useAISentimentForRecommendations: st.useAISentimentForRecommendations,
            useRSIGatingForRecommendations: st.useRSIGatingForRecommendations,
            sellOnlyLongTermQualified: st.sellOnlyLongTermQualified,
            lotsBySymbol: lots,
          };
          const stocks = st.stocks.map((s) => {
            if (s.symbol !== sym) return s;
            const q1 = Math.max(0, s.quantity - sellQty);
            return { ...s, quantity: q1, lastPrice: price };
          });
          const entry: TradeJournalEntry = { ...journalBase, side: "SELL", quantity: sellQty };
          const journal = [...st.tradeJournal, entry].slice(-200);
          const derived = derivePortfolioState(stocks, newCash, ctx, st);
          return {
            stocks: derived.stocks,
            lotsBySymbol: lots,
            cashBalance: newCash,
            tradeJournal: journal,
            portfolioSize: derived.portfolioSize,
            lastLocalMutationAt: mutationAt,
          };
        });
      },
      recordSellFromLot: (symbol, lotId, qty, price, date) => {
        if (qty <= 0 || !Number.isFinite(price)) return;
        const sym = symbol.toUpperCase();

        set((st) => {
          const mutationAt = new Date().toISOString();
          const existing = st.stocks.find((s) => s.symbol === sym);
          if (!existing || existing.quantity <= 0) return {};

          const lots = { ...st.lotsBySymbol };
          const cur = { ...(lots[sym] || { open: [], sold: [] }) };
          const targetLot = cur.open.find((lot) => lot.id === lotId);
          if (!targetLot || targetLot.quantity <= 0) return {};

          const sellQty = Math.min(qty, targetLot.quantity, existing.quantity);
          if (sellQty <= 0) return {};

          const proceeds = sellQty * price;
          const newCash = st.cashBalance + proceeds;
          const realizedGainLoss = (price - targetLot.costBasis) * sellQty;

          cur.open = reduceOpenLotById(cur.open, lotId, sellQty);
          cur.sold.unshift({
            saleDate: date,
            quantity: sellQty,
            salePrice: price,
            realizedGainLoss,
          });
          lots[sym] = cur;

          const stocks = st.stocks.map((s) => {
            if (s.symbol !== sym) return s;
            const q1 = Math.max(0, s.quantity - sellQty);
            return { ...s, quantity: q1, lastPrice: price };
          });

          const entry: TradeJournalEntry = {
            id: uid(),
            createdAt: new Date().toISOString(),
            symbol: sym,
            side: "SELL",
            quantity: sellQty,
            price,
            tradeDate: date,
            cashBefore: st.cashBalance,
            quantityBefore: existing.quantity,
            averageCostBefore: existing.averageCost,
            lastPriceBefore: existing.lastPrice ?? price,
          };

          const ctx: RecalcContext = {
            etfProfitTarget: st.etfProfitTarget,
            stockProfitTarget: st.stockProfitTarget,
            useAISentimentForRecommendations: st.useAISentimentForRecommendations,
            useRSIGatingForRecommendations: st.useRSIGatingForRecommendations,
            sellOnlyLongTermQualified: st.sellOnlyLongTermQualified,
            lotsBySymbol: lots,
          };
          const journal = [...st.tradeJournal, entry].slice(-200);
          const derived = derivePortfolioState(stocks, newCash, ctx, st);
          return {
            stocks: derived.stocks,
            lotsBySymbol: lots,
            cashBalance: newCash,
            tradeJournal: journal,
            portfolioSize: derived.portfolioSize,
            lastLocalMutationAt: mutationAt,
          };
        });
      },
      undoLastTrade: () => {
        const st = get();
        const entry = st.tradeJournal[st.tradeJournal.length - 1];
        if (!entry || entry.undoable === false) return false;
        set((s) => {
          const mutationAt = new Date().toISOString();
          const sym = entry.symbol;
          const journal = s.tradeJournal.slice(0, -1);
          const newCash = entry.cashBefore;
          if (entry.side === "BUY") {
            const lots = { ...s.lotsBySymbol };
            const cur = { ...(lots[sym] || { open: [], sold: [] }) };
            if (entry.lotId) {
              cur.open = cur.open.filter((l) => l.id !== entry.lotId);
            }
            lots[sym] = cur;
            const ctx: RecalcContext = {
              etfProfitTarget: s.etfProfitTarget,
              stockProfitTarget: s.stockProfitTarget,
              useAISentimentForRecommendations: s.useAISentimentForRecommendations,
              useRSIGatingForRecommendations: s.useRSIGatingForRecommendations,
              sellOnlyLongTermQualified: s.sellOnlyLongTermQualified,
              lotsBySymbol: lots,
            };
            let stocks: StockHolding[];
            if (entry.quantityBefore === 0) {
              stocks = s.stocks.filter((x) => x.symbol !== sym);
              delete lots[sym];
            } else {
              stocks = s.stocks.map((x) => {
                if (x.symbol !== sym) return x;
                return {
                  ...x,
                  quantity: entry.quantityBefore,
                  averageCost: entry.averageCostBefore,
                  lastPrice: entry.lastPriceBefore,
                };
              });
            }
            const derived = derivePortfolioState(stocks, newCash, ctx, s);
            return {
              stocks: derived.stocks,
              lotsBySymbol: lots,
              cashBalance: newCash,
              tradeJournal: journal,
              portfolioSize: derived.portfolioSize,
              lastLocalMutationAt: mutationAt,
            };
          }
          /* undo SELL */
          const lots = { ...s.lotsBySymbol };
          const cur = { ...(lots[sym] || { open: [], sold: [] }) };
          const [head, ...restSold] = cur.sold;
          if (
            head &&
            head.quantity === entry.quantity &&
            head.salePrice === entry.price &&
            head.saleDate === entry.tradeDate
          ) {
            cur.sold = restSold;
          } else {
            cur.sold = cur.sold.filter(
              (sl) =>
                !(
                  sl.quantity === entry.quantity &&
                  sl.salePrice === entry.price &&
                  sl.saleDate === entry.tradeDate
                )
            );
          }
          lots[sym] = cur;
          const ctx: RecalcContext = {
            etfProfitTarget: s.etfProfitTarget,
            stockProfitTarget: s.stockProfitTarget,
            useAISentimentForRecommendations: s.useAISentimentForRecommendations,
            useRSIGatingForRecommendations: s.useRSIGatingForRecommendations,
            sellOnlyLongTermQualified: s.sellOnlyLongTermQualified,
            lotsBySymbol: lots,
          };
          const stocks = s.stocks.map((x) => {
            if (x.symbol !== sym) return x;
            return {
              ...x,
              quantity: entry.quantityBefore,
              averageCost: entry.averageCostBefore,
              lastPrice: entry.lastPriceBefore,
            };
          });
          const derived = derivePortfolioState(stocks, newCash, ctx, s);
          return {
            stocks: derived.stocks,
            lotsBySymbol: lots,
            cashBalance: newCash,
            tradeJournal: journal,
            portfolioSize: derived.portfolioSize,
            lastLocalMutationAt: mutationAt,
          };
        });
        return true;
      },
      recalcMetrics: () =>
        set((st) => {
          const mutationAt = new Date().toISOString();
          const ctx: RecalcContext = {
            etfProfitTarget: st.etfProfitTarget,
            stockProfitTarget: st.stockProfitTarget,
            useAISentimentForRecommendations: st.useAISentimentForRecommendations,
            useRSIGatingForRecommendations: st.useRSIGatingForRecommendations,
            sellOnlyLongTermQualified: st.sellOnlyLongTermQualified,
            lotsBySymbol: st.lotsBySymbol,
          };
          const derived = derivePortfolioState(st.stocks, st.cashBalance, ctx, st);
          return { stocks: derived.stocks, portfolioSize: derived.portfolioSize, lastLocalMutationAt: mutationAt };
        }),
      clearAllHoldingsKeepingWatchlist: () => {
        // Bump generation so any in-flight optimizePendingStocks loop aborts immediately.
        optimizationGeneration += 1;
        set((st) => {
          const mutationAt = new Date().toISOString();
          const stocks = st.stocks.map((stock) => ({
            ...stock,
            quantity: 0,
            averageCost: 0,
          }));
          const lotsBySymbol: Record<string, { open: TradeLot[]; sold: SoldLot[] }> = {};
          const ctx: RecalcContext = {
            etfProfitTarget: st.etfProfitTarget,
            stockProfitTarget: st.stockProfitTarget,
            useAISentimentForRecommendations: st.useAISentimentForRecommendations,
            useRSIGatingForRecommendations: st.useRSIGatingForRecommendations,
            sellOnlyLongTermQualified: st.sellOnlyLongTermQualified,
            lotsBySymbol,
          };
          const derived = derivePortfolioState(stocks, st.cashBalance, ctx, st);
          return {
            stocks: derived.stocks,
            lotsBySymbol,
            tradeJournal: [],
            portfolioSize: derived.portfolioSize,
            lastLocalMutationAt: mutationAt,
            optimizing: false,
          };
        });
      },
      resetAll: () => {
        get().clearCachesOnReset();
        // Bump generation so any in-flight optimizePendingStocks loop aborts immediately.
        optimizationGeneration += 1;
        const mutationAt = new Date().toISOString();
        // Preserve watchlist-only stocks (quantity === 0, no open lots) — the user
        // only wants to clear actual holdings, not their watch list.
        const currentState = get();
        const watchlistStocks = currentState.stocks.filter((s) => {
          if (s.quantity > 0) return false;
          const lots = currentState.lotsBySymbol[s.symbol];
          return !lots || lots.open.length === 0;
        });
        // Keep lot entries only for preserved watchlist symbols (should be empty,
        // but guard against orphaned entries).
        const watchlistSymbolSet = new Set(watchlistStocks.map((s) => s.symbol));
        const remainingLots = Object.fromEntries(
          Object.entries(currentState.lotsBySymbol).filter(([sym]) => watchlistSymbolSet.has(sym))
        );
        set({
          cashBalance: 0,
          portfolioSize: 0,
          stocks: watchlistStocks,
          lotsBySymbol: remainingLots,
          tradeJournal: [],
          onboardingComplete: watchlistStocks.length > 0,
          lastRefreshAt: null,
          lastLocalMutationAt: mutationAt,
          optimizing: false,
        });
      },
      setOptimizing: (v) => set({ optimizing: v }),
      setOnboardingComplete: (v) => set({ onboardingComplete: v }),
      optimizeStock: async (symbol) => {
        const sym = symbol.trim().toUpperCase();
        const current = get();
        const stock = current.stocks.find((s) => s.symbol === sym);
        if (!stock) return { ok: false, error: `Stock ${sym} was not found.` };
        if (current.optimizing) return { ok: false, error: "Optimization already running." };

        get().setOptimizing(true);
        try {
          let strategy: OptimizedStrategyPayload | null = null;
          try {
            strategy = await requestOptimizedStrategy(stock, current);
          } catch (error) {
            const message = error instanceof Error ? error.message : `Optimization failed for ${sym}`;
            set((st) => {
              const ctx: RecalcContext = {
                etfProfitTarget: st.etfProfitTarget,
                stockProfitTarget: st.stockProfitTarget,
                useAISentimentForRecommendations: st.useAISentimentForRecommendations,
                useRSIGatingForRecommendations: st.useRSIGatingForRecommendations,
                sellOnlyLongTermQualified: st.sellOnlyLongTermQualified,
                lotsBySymbol: st.lotsBySymbol,
              };
              const stocks = st.stocks.map((item) =>
                item.symbol === sym ? { ...item, pendingOptimization: false } : item
              );
              const derived = derivePortfolioState(stocks, st.cashBalance, ctx, st);
              return { stocks: derived.stocks, portfolioSize: derived.portfolioSize };
            });
            return { ok: false, error: message };
          }

          set((st) => {
            const mutationAt = new Date().toISOString();
            const ctx: RecalcContext = {
              etfProfitTarget: st.etfProfitTarget,
              stockProfitTarget: st.stockProfitTarget,
              useAISentimentForRecommendations: st.useAISentimentForRecommendations,
              useRSIGatingForRecommendations: st.useRSIGatingForRecommendations,
              sellOnlyLongTermQualified: st.sellOnlyLongTermQualified,
              lotsBySymbol: st.lotsBySymbol,
            };
            const stocks = st.stocks.map((item) =>
              item.symbol === sym ? { ...item, ...strategy } : item
            );
            const derived = derivePortfolioState(stocks, st.cashBalance, ctx, st);
            return { stocks: derived.stocks, portfolioSize: derived.portfolioSize, lastLocalMutationAt: mutationAt };
          });
          return { ok: true };
        } finally {
          get().setOptimizing(false);
        }
      },
      optimizePendingStocks: async () => {
        const state = get();
        if (state.optimizing) return;
        const pendingSymbols = state.stocks
          .filter((stock) => stock.pendingOptimization)
          .map((stock) => stock.symbol);
        if (pendingSymbols.length === 0) return;

        const myGeneration = optimizationGeneration;
        get().setOptimizing(true);
        try {
          for (const symbol of pendingSymbols) {
            // Abort if a new import has started since this run began.
            if (optimizationGeneration !== myGeneration) break;
            const latest = get();
            const stock = latest.stocks.find((item) => item.symbol === symbol);
            if (!stock || !stock.pendingOptimization) continue;

            try {
              const strategy = await requestOptimizedStrategy(stock, latest);
              set((st) => {
                const mutationAt = new Date().toISOString();
                const ctx: RecalcContext = {
                  etfProfitTarget: st.etfProfitTarget,
                  stockProfitTarget: st.stockProfitTarget,
                  useAISentimentForRecommendations: st.useAISentimentForRecommendations,
                  useRSIGatingForRecommendations: st.useRSIGatingForRecommendations,
                  sellOnlyLongTermQualified: st.sellOnlyLongTermQualified,
                  lotsBySymbol: st.lotsBySymbol,
                };
                const stocks = st.stocks.map((item) =>
                  item.symbol === symbol ? { ...item, ...strategy } : item
                );
                const derived = derivePortfolioState(stocks, st.cashBalance, ctx, st);
                return { stocks: derived.stocks, portfolioSize: derived.portfolioSize, lastLocalMutationAt: mutationAt };
              });
            } catch {
              set((st) => {
                const ctx: RecalcContext = {
                  etfProfitTarget: st.etfProfitTarget,
                  stockProfitTarget: st.stockProfitTarget,
                  useAISentimentForRecommendations: st.useAISentimentForRecommendations,
                  useRSIGatingForRecommendations: st.useRSIGatingForRecommendations,
                  sellOnlyLongTermQualified: st.sellOnlyLongTermQualified,
                  lotsBySymbol: st.lotsBySymbol,
                };
                const stocks = st.stocks.map((item) =>
                  item.symbol === symbol ? { ...item, pendingOptimization: false } : item
                );
                const derived = derivePortfolioState(stocks, st.cashBalance, ctx, st);
                return { stocks: derived.stocks, portfolioSize: derived.portfolioSize };
              });
            }
          }
        } finally {
          get().setOptimizing(false);
        }
      },
      importCsvRows: (rows, mode, trades = []) => {
        // Cancel any in-flight optimizePendingStocks loop from a previous import.
        optimizationGeneration += 1;
        const grouped = new Map<string, CsvImportRow[]>();
        for (const row of rows) {
          const symbol = row.symbol.toUpperCase();
          const existing = grouped.get(symbol);
          if (existing) existing.push({ ...row, symbol });
          else grouped.set(symbol, [{ ...row, symbol }]);
        }

        const importedSymbols = [...new Set([...grouped.keys(), ...trades.map((trade) => trade.symbol.toUpperCase())])].sort((a, b) => a.localeCompare(b));
        const holdingsSymbols = new Set<string>();
        for (const [symbol, symbolRows] of grouped.entries()) {
          if (symbolRows.some((row) => Math.max(0, row.qty) > 0)) {
            holdingsSymbols.add(symbol);
          }
        }

        const importType = mode === "watchlist" || holdingsSymbols.size === 0 ? "watchlist" : "holdings";
        let addedCount = 0;
        const prunedWatchlistCount = 0;
        let importedTradeCount = 0;
        let liquidationCashCredited = 0;
        let cashAdjustedBy = 0;
        const importedSymbolsByAccount = new Map<string, Set<string>>();
        const netUpdatesMap = new Map<string, number>();
        const importPriceBySymbol = new Map<string, number>();

        for (const [symbol, symbolRows] of grouped.entries()) {
          let qtyTotal = 0;
          let valueTotal = 0;
          for (const row of symbolRows) {
            const qty = Math.max(0, row.qty);
            const price = Math.max(0, row.price);
            if (qty <= 0 || price <= 0) continue;
            qtyTotal += qty;
            valueTotal += qty * price;
          }
          if (qtyTotal > 0 && valueTotal > 0) {
            importPriceBySymbol.set(symbol, valueTotal / qtyTotal);
          }
        }

        if (mode === "portfolio") {
          for (const [symbol, symbolRows] of grouped.entries()) {
            for (const row of symbolRows) {
              if (Math.max(0, row.qty) <= 0) continue;
              const key = normalizeAccountKey(row.account);
              const symbols = importedSymbolsByAccount.get(key);
              if (symbols) {
                symbols.add(symbol);
              } else {
                importedSymbolsByAccount.set(key, new Set([symbol]));
              }
            }
          }
        }

        set((st) => {
          const mutationAt = new Date().toISOString();
          const preImportQtyBySymbol = new Map<string, number>();

          for (const stock of st.stocks) {
            const lots = st.lotsBySymbol[stock.symbol];
            const openQty = lots?.open.reduce((sum, lot) => sum + Math.max(0, lot.quantity), 0) ?? stock.quantity;
            if (openQty > 0) preImportQtyBySymbol.set(stock.symbol, openQty);
          }

          const keepExisting = st.stocks;

          const stockMap = new Map(keepExisting.map((stock) => [stock.symbol, stock] as const));
          const lotsBySymbol: Record<string, { open: TradeLot[]; sold: SoldLot[] }> = {};
          for (const stock of keepExisting) {
            const lots = st.lotsBySymbol[stock.symbol];
            if (lots) {
              lotsBySymbol[stock.symbol] = {
                open: lots.open.map(cloneTradeLot),
                sold: lots.sold.map(cloneSoldLot),
              };
            }
          }

          if (mode === "portfolio" && importedSymbolsByAccount.size > 0) {
            for (const [symbol, bundle] of Object.entries(lotsBySymbol)) {
              if (!bundle.open.length) continue;
              const keptOpen: TradeLot[] = [];
              const soldLots: SoldLot[] = [...bundle.sold];
              const groupedByAccount = new Map<string, TradeLot[]>();
              for (const lot of bundle.open) {
                const key = normalizeAccountKey(lot.account);
                const list = groupedByAccount.get(key);
                if (list) list.push(lot);
                else groupedByAccount.set(key, [lot]);
              }

              for (const [accountKey, accountLots] of groupedByAccount.entries()) {
                const importedSymbolsForAccount = importedSymbolsByAccount.get(accountKey);
                if (!importedSymbolsForAccount || importedSymbolsForAccount.has(symbol)) {
                  keptOpen.push(...accountLots);
                  continue;
                }

                const removedQty = accountLots.reduce((sum, lot) => sum + Math.max(0, lot.quantity), 0);
                if (removedQty <= 0) continue;

                const marketPrice = Math.max(0, stockMap.get(symbol)?.lastPrice ?? 0);
                const liquidationPrice = marketPrice;
                liquidationCashCredited += removedQty * liquidationPrice;

                soldLots.unshift({
                  saleDate: defaultImportPurchaseDate(),
                  quantity: removedQty,
                  salePrice: liquidationPrice,
                  realizedGainLoss:
                    accountLots.reduce((sum, lot) => sum + (liquidationPrice - Math.max(0, lot.costBasis)) * Math.max(0, lot.quantity), 0),
                });
              }

              keptOpen.sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
              lotsBySymbol[symbol] = {
                open: keptOpen,
                sold: soldLots,
              };
            }
          }

          for (const [symbol, symbolRows] of grouped.entries()) {
            const existing = stockMap.get(symbol);
            const existingLots = lotsBySymbol[symbol];
            const hasExistingLotHistory = !!existingLots && (existingLots.open.length > 0 || existingLots.sold.length > 0);
            const imported = buildImportedOpenLots(symbolRows);
            const hasImportedHoldings = imported.totalQty > 0;

            const preferredAccount =
              symbolRows
                .map((row) => row.account?.trim() ?? "")
                .find((value) => value.length > 0) ?? "";
            const preferredRetirement =
              symbolRows
                .map((row) => row.isRetirementAccount)
                .find((value): value is boolean => value != null) ?? null;

            if (mode === "watchlist") {
              if (existing) continue;
              addedCount += 1;
              stockMap.set(
                symbol,
                defaultStock({
                  symbol,
                  quantity: 0,
                  averageCost: 0,
                  name: imported.template.name,
                  pendingOptimization: true,
                })
              );
              continue;
            }

            if (hasImportedHoldings) {
              const preservedOpenLots =
                existingLots?.open.map((lot) => ({
                  ...cloneTradeLot(lot),
                  account: lot.account?.trim() || preferredAccount,
                  isRetirementAccount:
                    lot.isRetirementAccount == null ? preferredRetirement : lot.isRetirementAccount,
                })) ?? [];
              const preservedSoldLots = existingLots?.sold.map(cloneSoldLot) ?? [];
              let mergedOpenLots: TradeLot[] = [];
              const mergedSoldLots: SoldLot[] = [...preservedSoldLots];

              const importedByAccount = new Map<string, TradeLot[]>();
              for (const lot of imported.openLots.map(cloneTradeLot)) {
                const key = normalizeAccountKey(lot.account);
                const list = importedByAccount.get(key);
                if (list) list.push(lot);
                else importedByAccount.set(key, [lot]);
              }

              // Keep existing accounts unless this account+symbol combo is explicitly included in import.
              mergedOpenLots = preservedOpenLots.filter((lot) => !importedByAccount.has(normalizeAccountKey(lot.account)));

              for (const [accountKey, importedLots] of importedByAccount.entries()) {
                if (importedLots.length <= 0) continue;

                const existingAccountLots = preservedOpenLots
                  .filter((lot) => normalizeAccountKey(lot.account) === accountKey)
                  .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));

                if (importedLots.length === 1) {
                  const importedLot = importedLots[0];
                  const importedQty = Math.max(0, importedLot.quantity);
                  const existingQty = existingAccountLots.reduce((sum, lot) => sum + Math.max(0, lot.quantity), 0);

                  if (existingAccountLots.length === 0) {
                    mergedOpenLots.push(importedLot);
                    continue;
                  }

                  if (importedQty < existingQty) {
                    const reducedLots = reduceOpenLotsFifo(existingAccountLots, existingQty - importedQty).map((lot) => ({
                      ...lot,
                      account: lot.account?.trim() || importedLot.account,
                      isRetirementAccount:
                        lot.isRetirementAccount == null ? importedLot.isRetirementAccount : lot.isRetirementAccount,
                    }));
                    mergedOpenLots.push(...reducedLots);
                    continue;
                  }

                  if (importedQty > existingQty) {
                    mergedOpenLots.push(...existingAccountLots);
                    const deltaQty = importedQty - existingQty;
                    if (deltaQty > 0) {
                      mergedOpenLots.push({
                        ...importedLot,
                        quantity: deltaQty,
                      });
                    }
                    continue;
                  }

                  mergedOpenLots.push(
                    ...existingAccountLots.map((lot) => ({
                      ...lot,
                      account: lot.account?.trim() || importedLot.account,
                      isRetirementAccount:
                        lot.isRetirementAccount == null ? importedLot.isRetirementAccount : lot.isRetirementAccount,
                    }))
                  );
                  continue;
                }

                mergedOpenLots.push(...importedLots);
              }

              mergedOpenLots.sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));

              const mergedTotalQty = mergedOpenLots.reduce((sum, lot) => sum + Math.max(0, lot.quantity), 0);
              const mergedTotalBasis = mergedOpenLots.reduce((sum, lot) => sum + Math.max(0, lot.quantity) * Math.max(0, lot.costBasis), 0);
              const mergedAverageCost = mergedTotalQty > 0 ? mergedTotalBasis / mergedTotalQty : 0;

              lotsBySymbol[symbol] = {
                open: mergedOpenLots,
                sold: mergedSoldLots,
              };
              stockMap.set(
                symbol,
                defaultStock({
                  symbol,
                  quantity: mergedTotalQty,
                  averageCost: mergedAverageCost,
                  lastPrice:
                    existing?.lastPrice && existing.lastPrice > 0
                      ? existing.lastPrice
                      : imported.template.price > 0
                        ? imported.template.price
                        : undefined,
                  shortSMA: imported.template.shortSMA,
                  dynamicFactor: imported.template.dynamicFactor,
                  stockLimit: imported.template.stockLimit,
                  transactionLimit: imported.template.transactionLimit,
                  targetPrice: imported.template.targetPrice,
                  name: imported.template.name ?? existing?.name,
                  pendingOptimization: true,
                  ...preserveImportedMetadata(existing),
                })
              );
              if (!existing) addedCount += 1;
              continue;
            }

            if ((existing?.quantity ?? 0) > 0 || hasExistingLotHistory) continue;

            delete lotsBySymbol[symbol];
            stockMap.set(
              symbol,
              defaultStock({
                symbol,
                quantity: 0,
                averageCost: 0,
                lastPrice: existing?.lastPrice,
                name: imported.template.name ?? existing?.name,
                pendingOptimization: true,
                ...preserveImportedMetadata(existing),
              })
            );
            if (!existing) addedCount += 1;
          }

          if (mode === "portfolio") {
            for (const trade of trades) {
              const symbol = trade.symbol.toUpperCase();
              const qty = Math.max(0, trade.qty);
              const price = Math.max(0, trade.price);
              if (qty <= 0) continue;
              importedTradeCount += 1;

              const bundle = lotsBySymbol[symbol] ?? { open: [], sold: [] };
              const stock = stockMap.get(symbol);
              const averageCost = stock?.averageCost ?? 0;
              bundle.sold.unshift({
                saleDate: trade.tradeDate || defaultImportPurchaseDate(),
                quantity: qty,
                salePrice: price,
                realizedGainLoss: (price - averageCost) * qty,
              });
              lotsBySymbol[symbol] = bundle;
            }
          }

          const ctx: RecalcContext = {
            etfProfitTarget: st.etfProfitTarget,
            stockProfitTarget: st.stockProfitTarget,
            useAISentimentForRecommendations: st.useAISentimentForRecommendations,
            useRSIGatingForRecommendations: st.useRSIGatingForRecommendations,
            sellOnlyLongTermQualified: st.sellOnlyLongTermQualified,
            lotsBySymbol,
          };
          const postImportQtyBySymbol = new Map<string, number>();
          for (const stock of stockMap.values()) {
            const lots = lotsBySymbol[stock.symbol];
            const openQty = lots?.open.reduce((sum, lot) => sum + Math.max(0, lot.quantity), 0) ?? stock.quantity;
            if (openQty > 0) postImportQtyBySymbol.set(stock.symbol, openQty);
          }

          let cashDeltaFromHoldings = 0;
          const allSymbolsForDiff = new Set<string>([
            ...preImportQtyBySymbol.keys(),
            ...postImportQtyBySymbol.keys(),
          ]);
          for (const symbol of allSymbolsForDiff) {
            const beforeQty = preImportQtyBySymbol.get(symbol) ?? 0;
            const afterQty = postImportQtyBySymbol.get(symbol) ?? 0;
            const delta = afterQty - beforeQty;
            if (Math.abs(delta) > 1e-6) {
              netUpdatesMap.set(symbol, (netUpdatesMap.get(symbol) ?? 0) + delta);

              // CSV import is a portfolio snapshot, not a trade ledger.
              // Do not treat newly imported positions as fresh cash-spending buys.
              if (beforeQty <= 1e-6 && delta > 0) {
                continue;
              }

              const stockSnapshot = stockMap.get(symbol);
              const importPrice = importPriceBySymbol.get(symbol) ?? 0;
              const currentPrice = Math.max(0, stockSnapshot?.lastPrice ?? 0);
              const referencePrice =
                delta > 0
                  ? importPrice
                  : importPrice > 0
                    ? importPrice
                    : currentPrice;

              if (referencePrice > 0) {
                if (delta > 0) {
                  cashDeltaFromHoldings -= delta * referencePrice;
                } else {
                  cashDeltaFromHoldings += Math.abs(delta) * referencePrice;
                }
              }
            }
          }

          cashAdjustedBy = cashDeltaFromHoldings;
          const sortedStocks = [...stockMap.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
          const tradeJournal = buildTradeJournalFromLots(lotsBySymbol);
          const nextCashBalance = st.cashBalance + cashDeltaFromHoldings;
          const derived = derivePortfolioState(sortedStocks, nextCashBalance, ctx, st);

          return {
            stocks: derived.stocks,
            lotsBySymbol,
            tradeJournal,
            portfolioSize: derived.portfolioSize,
            cashBalance: nextCashBalance,
            lastLocalMutationAt: mutationAt,
          };
        });

        const netUpdates = [...netUpdatesMap.entries()]
          .filter(([, delta]) => Math.abs(delta) > 1e-6)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([symbol, delta]) => ({
            symbol,
            action: delta > 0 ? ("BUY" as const) : ("SELL" as const),
            qty: Math.abs(delta),
          }));

        return {
          importType,
          importedSymbols,
          importedCount: importedSymbols.length,
          addedCount,
          prunedWatchlistCount,
          importedTradeCount,
          netUpdates,
          liquidationCashCredited,
          cashAdjustedBy,
        };
      },
      replaceFromCloudSync: (payload) =>
        set((st) => {
          const ctx: RecalcContext = {
            etfProfitTarget: st.etfProfitTarget,
            stockProfitTarget: st.stockProfitTarget,
            useAISentimentForRecommendations: st.useAISentimentForRecommendations,
            useRSIGatingForRecommendations: st.useRSIGatingForRecommendations,
            sellOnlyLongTermQualified: st.sellOnlyLongTermQualified,
            lotsBySymbol: payload.lotsBySymbol,
          };
          const derived = derivePortfolioState(payload.stocks, payload.cashBalance, ctx, st, {
            shouldRecalculateLimits: false,
          });
          const inferredJournal = buildTradeJournalFromLots(payload.lotsBySymbol);
          return {
            cashBalance: payload.cashBalance,
            stocks: derived.stocks,
            lotsBySymbol: payload.lotsBySymbol,
            tradeJournal: inferredJournal,
            portfolioSize: derived.portfolioSize,
            onboardingComplete: payload.onboardingComplete,
          };
        }),
    }),
    {
      name: "stocks-pm-portfolio",
      merge: (persisted, current) => {
        const p = persisted as Partial<Pick<State, keyof State>> | undefined;
        return {
          ...current,
          ...p,
          tradeJournal: Array.isArray(p?.tradeJournal) ? p.tradeJournal : current.tradeJournal,
          // Reset transient runtime flags — these should never survive a page reload.
          // If optimizing/importing was in-flight when the page was closed, the job
          // is dead; persisting true permanently locks the Import CSV button.
          optimizing: false,
        };
      },
    }
  )
);
