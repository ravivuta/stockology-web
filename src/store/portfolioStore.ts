import { create } from "zustand";
import { persist } from "zustand/middleware";
import { computeRiskReturnScore } from "@/lib/ios-recommendation";
import { buildRecommendation } from "@/lib/recommendation";
import type { CsvImportRow } from "@/lib/csvPortfolio";
import { buildTradeJournalFromLots } from "@/lib/trade-journal-from-lots";

export type LotStatus = "open" | "partiallySold" | "fullySold" | "washSaleRestricted";

export type TradeLot = {
  id: string;
  quantity: number;
  costBasis: number;
  purchaseDate: string;
  account?: string;
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
  beta?: number;
  marketCap?: number;
  peg?: number;
  analystTarget?: number;
  analystAvg?: string;
  isETF?: boolean;
  /** Precomputed SMA for user's period (e.g. from iOS snapshot `moving_avg`). */
  movingAvg?: number;
  suppressTradeActions?: boolean;
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
  clearCachesOnReset: () => void;
  setCash: (n: number) => void;
  setSettings: (p: Partial<Pick<State, "riskAppetite" | "enableRiskFilter" | "limitWatchlistSize" | "etfProfitTarget" | "stockProfitTarget" | "useAISentimentForRecommendations" | "useRSIGatingForRecommendations" | "sellOnlyLongTermQualified" | "timezone" | "region">>) => void;
  addStock: (s: Partial<StockHolding> & { symbol: string }) => void;
  /** Merge fields into an existing symbol and rebuild recommendation. */
  updateStock: (symbol: string, patch: Partial<StockHolding>) => void;
  removeStock: (symbol: string) => void;
  recordTrade: (symbol: string, side: "BUY" | "SELL", qty: number, price: number, date: string) => void;
  /** Reverses the last journal entry only. Returns false if nothing to undo. */
  undoLastTrade: () => boolean;
  recalcMetrics: () => void;
  resetAll: () => void;
  setOptimizing: (v: boolean) => void;
  setOnboardingComplete: (v: boolean) => void;
  importHoldings: (rows: CsvImportRow[]) => void;
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

type RecalcContext = {
  etfProfitTarget: number;
  stockProfitTarget: number;
  useAISentimentForRecommendations: boolean;
  useRSIGatingForRecommendations: boolean;
  sellOnlyLongTermQualified: boolean;
  lotsBySymbol: Record<string, { open: TradeLot[]; sold: SoldLot[] }>;
};

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
  isShortlisted: partial.isShortlisted ?? true,
  isVisibleInRisk: partial.isVisibleInRisk ?? true,
  isInWatchlistSize: partial.isInWatchlistSize ?? true,
  analystTarget: partial.analystTarget,
  analystAvg: partial.analystAvg ?? "4.2",
  beta: partial.beta ?? 1.1,
  marketCap: partial.marketCap,
  peg: partial.peg ?? 1.5,
  isETF: partial.isETF ?? false,
  movingAvg: partial.movingAvg,
  suppressTradeActions: partial.suppressTradeActions ?? false,
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
      useAISentimentForRecommendations: true,
      useRSIGatingForRecommendations: true,
      sellOnlyLongTermQualified: false,
      timezone: "America/New_York",
      region: "US",
      stocks: [],
      lotsBySymbol: {},
      tradeJournal: [],
      onboardingComplete: false,
      optimizing: false,
      lastRefreshAt: null,
      clearCachesOnReset: () => {
        if (typeof window !== "undefined") {
          localStorage.removeItem("stocks-pm-portfolio");
        }
      },
      setCash: (n) => set({ cashBalance: n, portfolioSize: get().stocks.reduce((a, s) => a + s.quantity * (s.lastPrice ?? 0), 0) + n }),
      setSettings: (p) =>
        set((st) => {
          const nextState = { ...st, ...p };
          const ctx: RecalcContext = {
            etfProfitTarget: nextState.etfProfitTarget,
            stockProfitTarget: nextState.stockProfitTarget,
            useAISentimentForRecommendations: nextState.useAISentimentForRecommendations,
            useRSIGatingForRecommendations: nextState.useRSIGatingForRecommendations,
            sellOnlyLongTermQualified: nextState.sellOnlyLongTermQualified,
            lotsBySymbol: st.lotsBySymbol,
          };
          const stocks = st.stocks.map((s) => recalcHolding(s, ctx));
          const total = stocks.reduce((a, x) => a + x.quantity * (x.lastPrice ?? 0), 0) + st.cashBalance;
          return { ...p, stocks, portfolioSize: total };
        }),
      addStock: (s) =>
        set((st) => {
          const nh = recalcHolding(defaultStock(s), {
            etfProfitTarget: st.etfProfitTarget,
            stockProfitTarget: st.stockProfitTarget,
            useAISentimentForRecommendations: st.useAISentimentForRecommendations,
            useRSIGatingForRecommendations: st.useRSIGatingForRecommendations,
            sellOnlyLongTermQualified: st.sellOnlyLongTermQualified,
            lotsBySymbol: st.lotsBySymbol,
          });
          const stocks = [...st.stocks.filter((x) => x.symbol !== nh.symbol), nh];
          const total = stocks.reduce((a, x) => a + x.quantity * (x.lastPrice ?? 0), 0) + st.cashBalance;
          return { stocks, portfolioSize: total };
        }),
      updateStock: (symbol, patch) =>
        set((st) => {
          const sym = symbol.toUpperCase();
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
            return recalcHolding({ ...s, ...patch, symbol: sym }, ctx);
          });
          const total = stocks.reduce((a, x) => a + x.quantity * (x.lastPrice ?? 0), 0) + st.cashBalance;
          return { stocks, portfolioSize: total };
        }),
      removeStock: (symbol) =>
        set((st) => {
          const stocks = st.stocks.filter((s) => s.symbol !== symbol);
          const lots = { ...st.lotsBySymbol };
          delete lots[symbol];
          const total = stocks.reduce((a, x) => a + x.quantity * (x.lastPrice ?? 0), 0) + st.cashBalance;
          return { stocks, lotsBySymbol: lots, portfolioSize: total };
        }),
      recordTrade: (symbol, side, qty, price, date) => {
        if (qty <= 0 || !Number.isFinite(price)) return;
        const sym = symbol.toUpperCase();
        set((st) => {
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
                account: "",
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
              const nh = recalcHolding(
                defaultStock({
                  symbol: sym,
                  quantity: qty,
                  averageCost: price,
                  lastPrice: price,
                  pendingOptimization: true,
                }),
                ctx
              );
              stocks = [...st.stocks, nh];
            } else {
              stocks = st.stocks.map((s) => {
                if (s.symbol !== sym) return s;
                const q0 = s.quantity;
                const avg0 = s.averageCost;
                  const costBasis = q0 * avg0 + qty * price;
                  const q1 = q0 + qty;
                  const avg1 = q1 > 0 ? costBasis / q1 : 0;
                  return recalcHolding({ ...s, quantity: q1, averageCost: avg1, lastPrice: price }, ctx);
                });
            }
            const entry: TradeJournalEntry = { ...journalBase, side: "BUY", lotId };
            const journal = [...st.tradeJournal, entry].slice(-200);
            const total = stocks.reduce((a, x) => a + x.quantity * (x.lastPrice ?? 0), 0) + newCash;
            return { stocks, lotsBySymbol: lots, cashBalance: newCash, tradeJournal: journal, portfolioSize: total };
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
            return recalcHolding({ ...s, quantity: q1, lastPrice: price }, ctx);
          });
          const entry: TradeJournalEntry = { ...journalBase, side: "SELL", quantity: sellQty };
          const journal = [...st.tradeJournal, entry].slice(-200);
          const total = stocks.reduce((a, x) => a + x.quantity * (x.lastPrice ?? 0), 0) + newCash;
          return { stocks, lotsBySymbol: lots, cashBalance: newCash, tradeJournal: journal, portfolioSize: total };
        });
      },
      undoLastTrade: () => {
        const st = get();
        const entry = st.tradeJournal[st.tradeJournal.length - 1];
        if (!entry || entry.undoable === false) return false;
        set((s) => {
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
                return recalcHolding(
                  {
                    ...x,
                    quantity: entry.quantityBefore,
                    averageCost: entry.averageCostBefore,
                    lastPrice: entry.lastPriceBefore,
                  },
                  ctx
                );
              });
            }
            const total = stocks.reduce((a, x) => a + x.quantity * (x.lastPrice ?? 0), 0) + newCash;
            return { stocks, lotsBySymbol: lots, cashBalance: newCash, tradeJournal: journal, portfolioSize: total };
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
            return recalcHolding(
              {
                ...x,
                quantity: entry.quantityBefore,
                averageCost: entry.averageCostBefore,
                lastPrice: entry.lastPriceBefore,
              },
              ctx
            );
          });
          const total = stocks.reduce((a, x) => a + x.quantity * (x.lastPrice ?? 0), 0) + newCash;
          return { stocks, lotsBySymbol: lots, cashBalance: newCash, tradeJournal: journal, portfolioSize: total };
        });
        return true;
      },
      recalcMetrics: () =>
        set((st) => {
          const ctx: RecalcContext = {
            etfProfitTarget: st.etfProfitTarget,
            stockProfitTarget: st.stockProfitTarget,
            useAISentimentForRecommendations: st.useAISentimentForRecommendations,
            useRSIGatingForRecommendations: st.useRSIGatingForRecommendations,
            sellOnlyLongTermQualified: st.sellOnlyLongTermQualified,
            lotsBySymbol: st.lotsBySymbol,
          };
          const stocks = st.stocks.map((s) => recalcHolding(s, ctx));
          const total = stocks.reduce((a, x) => a + x.quantity * (x.lastPrice ?? 0), 0) + st.cashBalance;
          return { stocks, portfolioSize: total };
        }),
      resetAll: () => {
        get().clearCachesOnReset();
        set({
          cashBalance: 0,
          portfolioSize: 0,
          stocks: [],
          lotsBySymbol: {},
          tradeJournal: [],
          onboardingComplete: false,
          lastRefreshAt: null,
        });
      },
      setOptimizing: (v) => set({ optimizing: v }),
      setOnboardingComplete: (v) => set({ onboardingComplete: v }),
      importHoldings: (rows) => {
        rows.forEach((r) => {
          const lastPrice = r.qty === 0 && r.price === 0 ? 0 : r.price > 0 ? r.price : undefined;
          get().addStock({
            symbol: r.symbol.toUpperCase(),
            quantity: r.qty,
            averageCost: r.price,
            lastPrice,
            shortSMA: r.shortSMA,
            dynamicFactor: r.dynamicFactor,
            stockLimit: r.stockLimit,
            transactionLimit: r.transactionLimit,
            targetPrice: r.targetPrice,
            name: r.name,
            pendingOptimization: true,
          });
        });
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
          const stocks = payload.stocks.map((s) => recalcHolding(s, ctx));
          const portfolioSize =
            stocks.reduce((a, x) => a + x.quantity * (x.lastPrice ?? 0), 0) + payload.cashBalance;
          const inferredJournal = buildTradeJournalFromLots(payload.lotsBySymbol);
          return {
            cashBalance: payload.cashBalance,
            stocks,
            lotsBySymbol: payload.lotsBySymbol,
            tradeJournal: inferredJournal,
            portfolioSize,
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
        };
      },
    }
  )
);
