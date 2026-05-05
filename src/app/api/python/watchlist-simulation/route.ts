import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  computeIosRecommendation,
  computeRiskReturnScore,
  recommendedWatchlistSize,
  stockPassesRiskFilter,
  type IosStockInput,
} from "@/lib/ios-recommendation";
import type { StockHolding } from "@/store/portfolioStore";

type HistoryRow = {
  date: string;
  close: number | null;
};

type SimPosition = {
  shares: number;
  avgCost: number;
  totalInvested: number;
};

type TradeRecord = {
  date: string;
  action: string;
  price: number;
  profit: number | null;
  totalQty?: number;
  avgPrice?: number;
  recommendationComment?: string;
};

type SimStock = StockHolding & {
  score: number | undefined;
  isVisibleInRisk: boolean;
  isInRecommendedWatchlist: boolean;
};

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function upsidePercent(lastPrice: number | undefined, analystTarget: number | undefined): number | undefined {
  if ((lastPrice ?? 0) <= 0 || (analystTarget ?? 0) <= 0) return undefined;
  return (((analystTarget ?? 0) - (lastPrice ?? 0)) / (lastPrice ?? 1)) * 100;
}

function sanitizeHistory(rows: HistoryRow[] | null | undefined) {
  return (rows ?? [])
    .map((row) => ({
      date: String(row.date).slice(0, 10),
      close: Number(row.close),
    }))
    .filter((row) => row.date && Number.isFinite(row.close) && row.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildUniverse(
  stocks: StockHolding[],
  settings: {
    portfolioSize: number;
    riskAppetite: "Low" | "Medium" | "High";
    enableRiskFilter: boolean;
    limitWatchlistSize: boolean;
  }
) {
  const idealWatchlistSize = recommendedWatchlistSize(settings.portfolioSize);
  const scored: SimStock[] = stocks.map((stock) => {
    const score = stock.isETF ? undefined : (stock.score ?? computeRiskReturnScore(stock));
    const isVisibleInRisk = stockPassesRiskFilter(
      { ...stock, score },
      settings.riskAppetite,
      settings.enableRiskFilter,
      upsidePercent(stock.lastPrice, stock.analystTarget)
    );
    return {
      ...stock,
      score,
      isVisibleInRisk,
      isInRecommendedWatchlist: false,
    };
  });

  const shortlistedSymbols = new Set<string>();

  if (settings.limitWatchlistSize) {
    const holdingSymbols = scored.filter((stock) => stock.quantity > 0);
    const unownedEtfs = scored.filter((stock) => stock.quantity <= 0 && stock.isETF === true);
    const eligibleOthers = scored
      .filter((stock) => stock.quantity <= 0 && stock.isETF !== true && stock.isVisibleInRisk)
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
    for (const stock of scored) {
      if (stock.quantity > 0 || stock.isETF === true || stock.isVisibleInRisk) {
        shortlistedSymbols.add(stock.symbol);
      }
    }
  }

  const universe = scored
    .map((stock) => ({
      ...stock,
      isInRecommendedWatchlist: shortlistedSymbols.has(stock.symbol),
    }))
    .filter((stock) => {
      if (settings.enableRiskFilter && !stock.isVisibleInRisk) return false;
      if (settings.limitWatchlistSize && !stock.isInRecommendedWatchlist) return false;
      return true;
    });

  return { idealWatchlistSize, universe };
}

export async function POST(request: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const rawStocks = Array.isArray(payload.stocks) ? (payload.stocks as StockHolding[]) : [];
  const cleanedStocks = rawStocks
    .map((stock) => ({
      ...stock,
      symbol: String(stock?.symbol ?? "").trim().toUpperCase(),
    }))
    .filter((stock) => /^[A-Z0-9.^-]{1,10}$/.test(stock.symbol));

  if (cleanedStocks.length === 0) {
    return jsonError("Provide at least one tracked stock");
  }

  const years = Math.trunc(clampNumber(payload.years ?? 1, 1, 1, 5));
  const portfolioSize = clampNumber(payload.portfolioSize ?? 10000, 10000, 1000, 10_000_000);
  const riskAppetite = (["Low", "Medium", "High"].includes(String(payload.riskAppetite))
    ? String(payload.riskAppetite)
    : "Medium") as "Low" | "Medium" | "High";
  const enableRiskFilter = payload.enableRiskFilter == null ? true : Boolean(payload.enableRiskFilter);
  const limitWatchlistSize = payload.limitWatchlistSize == null ? false : Boolean(payload.limitWatchlistSize);
  const etfProfitTargetPercent = clampNumber(payload.etfProfitTargetPercent ?? 50, 50, 0, 500);
  const stockProfitTargetPercent = clampNumber(payload.stockProfitTargetPercent ?? 50, 50, 0, 500);
  const useRSIGating = payload.useRSIGating == null ? true : Boolean(payload.useRSIGating);

  const { idealWatchlistSize, universe } = buildUniverse(cleanedStocks, {
    portfolioSize,
    riskAppetite,
    enableRiskFilter,
    limitWatchlistSize,
  });

  if (universe.length === 0) {
    return jsonError("No stocks remain after risk and watchlist-size filtering");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return jsonError("Supabase configuration is missing", 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const maxSMA = Math.max(...universe.map((stock) => Math.max(2, Math.trunc(stock.shortSMA || 50))), 50);
  const historyDays = years * 252 + maxSMA + 80;
  const symbols = universe.map((stock) => stock.symbol);

  const [historyResults, { data: tickerRows, error: tickerError }] = await Promise.all([
    Promise.all(
      symbols.map(async (symbol) => {
        const { data, error } = await supabase.rpc("get_historical_prices", {
          p_symbol: symbol,
          p_days: historyDays,
        });
        return { symbol, data: data as HistoryRow[] | null, error };
      })
    ),
    supabase
      .from("ticker_data")
      .select("symbol, analyst_average, market_cap, peg_ratio, analyst_target, company_name, is_etf")
      .in("symbol", symbols),
  ]);

  if (tickerError) {
    return jsonError(tickerError.message, 500);
  }

  const tickerMap = new Map(
    (tickerRows ?? []).map((row) => [
      String(row.symbol).toUpperCase(),
      {
        analystAvg: row.analyst_average != null ? String(row.analyst_average) : undefined,
        marketCap: row.market_cap != null ? Number(row.market_cap) : undefined,
        peg: row.peg_ratio != null ? Number(row.peg_ratio) : undefined,
        analystTarget: row.analyst_target != null ? Number(row.analyst_target) : undefined,
        name: row.company_name != null ? String(row.company_name) : undefined,
        isETF: row.is_etf != null ? Boolean(row.is_etf) : undefined,
      },
    ])
  );

  const histories = new Map<string, { date: string; close: number }[]>();
  const insufficientSymbols: string[] = [];
  const unavailableSymbols: string[] = [];

  for (const result of historyResults) {
    if (result.error) {
      unavailableSymbols.push(result.symbol);
      continue;
    }
    const history = sanitizeHistory(result.data);
    const stock = universe.find((candidate) => candidate.symbol === result.symbol);
    if (!stock || history.length <= Math.max(2, Math.trunc(stock.shortSMA || 50))) {
      insufficientSymbols.push(result.symbol);
      continue;
    }
    histories.set(result.symbol, history);
  }

  const validStocks = universe
    .map((stock) => {
      const ticker = tickerMap.get(stock.symbol);
      return {
        ...stock,
        name: stock.name || ticker?.name,
        analystAvg: stock.analystAvg ?? ticker?.analystAvg,
        marketCap: stock.marketCap ?? ticker?.marketCap,
        peg: stock.peg ?? ticker?.peg,
        analystTarget: stock.analystTarget ?? ticker?.analystTarget,
        isETF: stock.isETF ?? ticker?.isETF,
      };
    })
    .filter((stock) => histories.has(stock.symbol));

  if (validStocks.length === 0) {
    return jsonError("No stocks have sufficient historical data for watchlist simulation");
  }

  let cash = portfolioSize;
  const initialCash = portfolioSize;
  const positions = new Map<string, SimPosition>();
  const stockTrades = new Map<string, TradeRecord[]>();
  const stockWins = new Map<string, number>();
  const stockTotalTrades = new Map<string, number>();
  const peakInvested = new Map<string, number>();
  const historyLookup = new Map(validStocks.map((stock) => [stock.symbol, histories.get(stock.symbol) ?? []]));
  const stockSimulationLengths = new Map<string, number>();
  const startIndexBySymbol = new Map<string, number>();
  const requestedTradingDays = years * 252;

  for (const stock of validStocks) {
    stockTrades.set(stock.symbol, []);
    stockWins.set(stock.symbol, 0);
    stockTotalTrades.set(stock.symbol, 0);
    peakInvested.set(stock.symbol, 0);

    const history = historyLookup.get(stock.symbol) ?? [];
    const availableForSimulation = Math.max(0, history.length - stock.shortSMA);
    const effectiveLengthForStock = Math.max(0, Math.min(requestedTradingDays, availableForSimulation));
    const startIdx = Math.max(stock.shortSMA, history.length - effectiveLengthForStock);
    stockSimulationLengths.set(stock.symbol, Math.max(0, history.length - startIdx));
    startIndexBySymbol.set(stock.symbol, startIdx);
  }

  const maxSimulationLength = Math.max(...Array.from(stockSimulationLengths.values()), 0);
  if (maxSimulationLength <= 0) {
    return jsonError("No stocks have sufficient historical data for the selected lookback");
  }

  for (let dayIndex = 0; dayIndex < maxSimulationLength; dayIndex += 1) {
    for (const stock of validStocks) {
      const history = historyLookup.get(stock.symbol) ?? [];
      const stockSimLength = stockSimulationLengths.get(stock.symbol) ?? 0;
      if (dayIndex >= stockSimLength) continue;

      const startIdx = startIndexBySymbol.get(stock.symbol) ?? stock.shortSMA;
      const absIndex = startIdx + dayIndex;
      if (absIndex >= history.length || absIndex < stock.shortSMA) continue;

      const current = history[absIndex];
      if (!current || current.close <= 0) continue;

      const recentCloses = history.slice(absIndex - stock.shortSMA, absIndex).map((row) => row.close);
      const position = positions.get(stock.symbol);
      const analystTargetForSimulation =
        stock.isETF === true ? undefined : stock.analystTarget != null && stock.analystTarget > 0 ? stock.analystTarget : undefined;

      const input: IosStockInput = {
        ...stock,
        quantity: position?.shares ?? 0,
        averageCost: position?.avgCost ?? 0,
        lastPrice: current.close,
      };
      input.score = input.isETF ? undefined : computeRiskReturnScore(input);

      const rec = computeIosRecommendation(input, {
        closes: recentCloses,
        etfProfitTargetPercent,
        stockProfitTargetPercent,
        skipWashSaleCheck: true,
        relaxScoreRequirement: true,
        useAISentiment: false,
        useRSIGating,
        sellOnlyLongTermQualified: false,
      });

      const hasEnoughUpside =
        analystTargetForSimulation != null && analystTargetForSimulation > 0 && current.close > 0
          ? ((analystTargetForSimulation - current.close) / current.close) * 100 >= 25
          : true;

      if ((rec.action === "BUY" || rec.action === "ADD") && hasEnoughUpside) {
        const currentInvestment = position?.totalInvested ?? 0;
        const maxAllocation = 2 * stock.stockLimit;
        const availableForStock = Math.max(0, maxAllocation - currentInvestment);
        if (availableForStock > 0 && cash > 0) {
          const maxToInvest = Math.min(cash, Math.min(stock.transactionLimit, availableForStock));
          const sharesToBuy = Math.floor(maxToInvest / current.close);
          if (sharesToBuy > 0) {
            const investmentAmount = sharesToBuy * current.close;
            cash -= investmentAmount;

            const oldShares = position?.shares ?? 0;
            const oldInvested = position?.totalInvested ?? 0;
            const newShares = oldShares + sharesToBuy;
            const newInvested = oldInvested + investmentAmount;
            const newAvgCost = newInvested / newShares;

            positions.set(stock.symbol, {
              shares: newShares,
              avgCost: newAvgCost,
              totalInvested: newInvested,
            });
            peakInvested.set(stock.symbol, Math.max(peakInvested.get(stock.symbol) ?? 0, newInvested));
            stockTrades.get(stock.symbol)?.push({
              date: current.date,
              action: rec.action,
              price: current.close,
              profit: null,
              totalQty: newShares,
              avgPrice: newAvgCost,
              recommendationComment: rec.comments,
            });
          }
        }
      } else if ((rec.action === "SELL" || rec.action === "REDUCE") && position && position.shares > 0) {
        const sharesToSell =
          rec.action === "SELL" ? position.shares : Math.min(position.shares, Math.floor(stock.transactionLimit / current.close));
        if (sharesToSell > 0) {
          const saleProceeds = sharesToSell * current.close;
          const costBasis = sharesToSell * position.avgCost;
          const profit = saleProceeds - costBasis;
          cash += saleProceeds;

          const remainingShares = position.shares - sharesToSell;
          const remainingInvestment = remainingShares * position.avgCost;
          if (remainingShares > 0) {
            positions.set(stock.symbol, {
              shares: remainingShares,
              avgCost: position.avgCost,
              totalInvested: remainingInvestment,
            });
          } else {
            positions.delete(stock.symbol);
          }

          stockTotalTrades.set(stock.symbol, (stockTotalTrades.get(stock.symbol) ?? 0) + 1);
          if (profit > 0) {
            stockWins.set(stock.symbol, (stockWins.get(stock.symbol) ?? 0) + 1);
          }

          stockTrades.get(stock.symbol)?.push({
            date: current.date,
            action: rec.action,
            price: current.close,
            profit,
            totalQty: remainingShares,
            avgPrice: remainingShares > 0 ? position.avgCost : 0,
            recommendationComment: rec.comments,
          });
        }
      }
    }
  }

  const totalInvested = validStocks.reduce((sum, stock) => sum + (peakInvested.get(stock.symbol) ?? 0), 0);
  let totalProfit = 0;
  let totalRealizedProfit = 0;
  let totalUnrealizedProfit = 0;

  const stockContributions = validStocks.map((stock) => {
    const position = positions.get(stock.symbol);
    const history = historyLookup.get(stock.symbol) ?? [];
    const finalPrice = history.at(-1)?.close ?? 0;
    const trades = stockTrades.get(stock.symbol) ?? [];
    const wins = stockWins.get(stock.symbol) ?? 0;
    const totalSellTrades = stockTotalTrades.get(stock.symbol) ?? 0;
    const currentValue = (position?.shares ?? 0) * finalPrice;
    const realizedProfit = trades.filter((trade) => trade.profit != null).reduce((sum, trade) => sum + (trade.profit ?? 0), 0);
    const unrealizedProfit = currentValue - (position?.totalInvested ?? 0);
    const stockProfit = realizedProfit + unrealizedProfit;
    const stockInvested = peakInvested.get(stock.symbol) ?? (position?.totalInvested ?? 0);
    const buySignals = trades.filter((trade) => trade.action === "BUY" || trade.action === "ADD").length;
    const sellSignals = trades.filter((trade) => trade.action === "SELL" || trade.action === "REDUCE").length;
    const tradeCount = totalSellTrades + buySignals;
    const winRate = totalSellTrades > 0 ? (wins / totalSellTrades) * 100 : 0;
    const profitPct = stockInvested > 0 ? (stockProfit / stockInvested) * 100 : 0;

    totalProfit += stockProfit;
    totalRealizedProfit += realizedProfit;
    totalUnrealizedProfit += unrealizedProfit;

    return {
      symbol: stock.symbol,
      investedAmount: stockInvested,
      currentValue,
      profit: stockProfit,
      profitPct,
      contributionPct: 0,
      unrealizedGainPct: stockInvested > 0 ? (unrealizedProfit / stockInvested) * 100 : 0,
      realizedGainPct: stockInvested > 0 ? (realizedProfit / stockInvested) * 100 : 0,
      trades: tradeCount,
      winRate,
      result: {
        periodDescription: `${years} year${years > 1 ? "s" : ""}`,
        totalTrades: totalSellTrades,
        buySignals,
        sellSignals,
        startPrice: history[0]?.close ?? 0,
        endPrice: finalPrice,
        totalReturn: profitPct,
        winRate,
        avgProfitPerTrade: totalSellTrades > 0 ? stockProfit / totalSellTrades : 0,
      },
      tradeLog: trades,
    };
  });

  const holdingsValue = validStocks.reduce((sum, stock) => {
    const position = positions.get(stock.symbol);
    const finalPrice = historyLookup.get(stock.symbol)?.at(-1)?.close ?? 0;
    return sum + (position?.shares ?? 0) * finalPrice;
  }, 0);
  const finalPortfolioValue = cash + holdingsValue;
  const portfolioReturn = initialCash > 0 ? ((finalPortfolioValue - initialCash) / initialCash) * 100 : 0;
  const avgWinRate =
    validStocks.length > 0
      ? validStocks.reduce((sum, stock) => {
          const sells = stockTotalTrades.get(stock.symbol) ?? 0;
          const wins = stockWins.get(stock.symbol) ?? 0;
          return sum + (sells > 0 ? (wins / sells) * 100 : 0);
        }, 0) / validStocks.length
      : 0;

  const stockContributionsWithPct = stockContributions.map((stock) => ({
    ...stock,
    contributionPct: totalProfit !== 0 ? (stock.profit / Math.abs(totalProfit)) * portfolioReturn : 0,
  }));

  return NextResponse.json({
    ok: true,
    mode: "watchlist",
    years,
    universe: {
      totalTracked: cleanedStocks.length,
      totalSimulated: validStocks.length,
      idealWatchlistSize,
      riskAppetite,
      enableRiskFilter,
      limitWatchlistSize,
      simulatedSymbols: validStocks.map((stock) => stock.symbol),
      skippedSymbols: {
        insufficientHistory: insufficientSymbols,
        unavailableHistory: unavailableSymbols,
      },
      gating: {
        considered: [
          "Risk appetite filter",
          "Limit to recommended watchlist size",
          "Holdings always included",
          "Unowned ETFs always included",
          "Top-scoring remaining watchlist stocks fill remaining slots",
          "RSI gate setting",
          "ETF/stock profit target settings",
          "Analyst-target upside gate for BUY/ADD (>= 25%)",
        ],
        bypassed: [
          "Score threshold gate",
          "AI sentiment gate",
          "Wash-sale rule",
          "Sell-only long-term-qualified gate",
        ],
      },
    },
    result: {
      initialCash,
      finalCash: cash,
      finalPortfolioValue,
      totalInvested,
      totalReturn: portfolioReturn,
      unrealizedGainPct: initialCash > 0 ? (totalUnrealizedProfit / initialCash) * 100 : 0,
      realizedGainPct: initialCash > 0 ? (totalRealizedProfit / initialCash) * 100 : 0,
      totalTrades: stockContributionsWithPct.reduce((sum, stock) => sum + stock.trades, 0),
      avgWinRate,
      stockContributions: stockContributionsWithPct.sort((a, b) => b.profit - a.profit),
    },
  });
}
