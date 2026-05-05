import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  calculateTradingLimits,
  computeIosRecommendation,
  computeRiskReturnScore,
  type IosStockInput,
} from "@/lib/ios-recommendation";

type HistoryRow = {
  date: string;
  close: number | null;
};

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

type SimulationStrategy = {
  shortSMA: number;
  dynamicFactor: number;
  stockLimit: number;
  transactionLimit: number;
};

type SimulationInputs = {
  symbol: string;
  closes: number[];
  isETF: boolean;
  analystTarget?: number;
  analystAvg?: string;
  marketCap?: number;
  peg?: number;
  aiSentimentScore?: number;
  enableRSIReversalGate: boolean;
  rsiPeriod: number;
  rsiOversoldThreshold: number;
  rsiOverboughtThreshold: number;
  rsiHysteresisPoints: number;
  rsiMinRisingDays: number;
  etfProfitTargetPercent: number;
  stockProfitTargetPercent: number;
  useRSIGating: boolean;
};

function simulateStrategyReturn(
  inputs: SimulationInputs,
  strategy: SimulationStrategy
): number {
  const initialCash = Math.max(strategy.stockLimit * 2, strategy.transactionLimit, 1);
  let cash = initialCash;
  let shares = 0;
  let positionAvg: number | null = null;

  for (let index = strategy.shortSMA; index < inputs.closes.length; index += 1) {
    const current = inputs.closes[index];
    if (!Number.isFinite(current) || current <= 0) continue;

    const recentCloses = inputs.closes.slice(Math.max(0, index - strategy.shortSMA), index);
    const stock: IosStockInput = {
      symbol: inputs.symbol,
      quantity: shares,
      averageCost: positionAvg ?? 0,
      lastPrice: current,
      shortSMA: strategy.shortSMA,
      dynamicFactor: strategy.dynamicFactor,
      stockLimit: strategy.stockLimit,
      transactionLimit: strategy.transactionLimit,
      isETF: inputs.isETF,
      analystTarget: inputs.analystTarget,
      analystAvg: inputs.analystAvg,
      marketCap: inputs.marketCap,
      peg: inputs.peg,
      aiSentimentScore: inputs.aiSentimentScore,
      enableRSIReversalGate: inputs.enableRSIReversalGate,
      rsiPeriod: inputs.rsiPeriod,
      rsiOversoldThreshold: inputs.rsiOversoldThreshold,
      rsiOverboughtThreshold: inputs.rsiOverboughtThreshold,
      rsiHysteresisPoints: inputs.rsiHysteresisPoints,
      rsiMinRisingDays: inputs.rsiMinRisingDays,
    };
    stock.score = stock.isETF ? undefined : computeRiskReturnScore(stock);

    const rec = computeIosRecommendation(stock, {
      closes: recentCloses,
      etfProfitTargetPercent: inputs.etfProfitTargetPercent,
      stockProfitTargetPercent: inputs.stockProfitTargetPercent,
      skipWashSaleCheck: true,
      relaxScoreRequirement: true,
      useAISentiment: false,
      useRSIGating: inputs.useRSIGating,
      sellOnlyLongTermQualified: false,
    });

    const hasEnoughUpside =
      inputs.analystTarget != null && inputs.analystTarget > 0 && current > 0
        ? ((inputs.analystTarget - current) / current) * 100 >= 25
        : true;

    if (rec.action === "BUY" && positionAvg == null) {
      const sharesToBuy = Math.floor(Math.min(cash, strategy.transactionLimit) / current);
      if (sharesToBuy > 0 && hasEnoughUpside) {
        shares = sharesToBuy;
        cash -= sharesToBuy * current;
        positionAvg = current;
      }
      continue;
    }

    if (rec.action === "ADD" && positionAvg != null && hasEnoughUpside) {
      const sharesToBuy = Math.floor(Math.min(cash, strategy.transactionLimit) / current);
      if (sharesToBuy > 0) {
        const totalCost: number = shares * positionAvg + sharesToBuy * current;
        shares += sharesToBuy;
        positionAvg = totalCost / shares;
        cash -= sharesToBuy * current;
      }
      continue;
    }

    if (rec.action === "SELL" && positionAvg != null && shares > 0) {
      cash += shares * current;
      shares = 0;
      positionAvg = null;
      continue;
    }

    if (rec.action === "REDUCE" && positionAvg != null && shares > 0) {
      const costBasis = shares * positionAvg;
      const unrealizedGain = (current - positionAvg) * shares;
      const moneyToFree = costBasis - strategy.stockLimit;
      const sharesToReduce =
        moneyToFree > strategy.transactionLimit && unrealizedGain > moneyToFree
          ? Math.floor(moneyToFree / current)
          : 0;
      if (sharesToReduce > 0 && sharesToReduce < shares) {
        cash += sharesToReduce * current;
        shares -= sharesToReduce;
      }
    }
  }

  const finalClose = inputs.closes.at(-1) ?? 0;
  const finalValue = cash + shares * finalClose;
  return initialCash > 0 ? ((finalValue - initialCash) / initialCash) * 100 : 0;
}

export async function POST(request: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const symbol = String(payload.symbol ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9.^-]{1,10}$/.test(symbol)) {
    return jsonError("Provide a valid ticker symbol");
  }

  const portfolioSize = clampNumber(payload.portfolioSize ?? 0, 0, 0, 1_000_000_000);
  const watchlistCount = Math.max(1, Math.round(clampNumber(payload.watchlistCount ?? 10, 10, 1, 500)));
  const etfProfitTargetPercent = clampNumber(payload.etfProfitTargetPercent ?? 50, 50, 0, 500);
  const stockProfitTargetPercent = clampNumber(payload.stockProfitTargetPercent ?? 50, 50, 0, 500);
  const useRSIGating = payload.useRSIGating == null ? true : Boolean(payload.useRSIGating);
  const enableRSIReversalGate = payload.enableRSIReversalGate == null ? true : Boolean(payload.enableRSIReversalGate);
  const rsiPeriod = Math.round(clampNumber(payload.rsiPeriod ?? 14, 14, 2, 30));
  const rsiOversoldThreshold = clampNumber(payload.rsiOversoldThreshold ?? 30, 30, 10, 50);
  const rsiOverboughtThreshold = clampNumber(payload.rsiOverboughtThreshold ?? 70, 70, 50, 90);
  const rsiHysteresisPoints = clampNumber(payload.rsiHysteresisPoints ?? 5, 5, 0, 20);
  const rsiMinRisingDays = Math.round(clampNumber(payload.rsiMinRisingDays ?? 2, 2, 1, 5));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return jsonError("Supabase configuration is missing", 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const historyDays = 252 * 5 + 280;
  const [{ data: historyData, error: historyError }, { data: tickerRow }, { data: sentimentRow }] = await Promise.all([
    supabase.rpc("get_historical_prices", { p_symbol: symbol, p_days: historyDays }),
    supabase
      .from("ticker_data")
      .select("symbol, analyst_average, market_cap, peg_ratio, analyst_target, is_etf")
      .eq("symbol", symbol)
      .maybeSingle(),
    supabase
      .from("ai_sentiment_scores")
      .select("symbol, sentiment_score")
      .eq("symbol", symbol)
      .maybeSingle(),
  ]);

  if (historyError) {
    return jsonError(historyError.message, 500);
  }

  const closes = ((historyData ?? []) as HistoryRow[])
    .map((row) => Number(row.close))
    .filter((close) => Number.isFinite(close) && close > 0);

  if (closes.length < 252) {
    return jsonError(`Insufficient historical data for ${symbol}. Need about 1 year of daily closes.`, 422);
  }

  const availableYears = Math.max(1, Math.floor(closes.length / 252));
  const simulationYears = Math.min(5, availableYears);
  const analystTarget =
    payload.analystTarget != null ? Number(payload.analystTarget) : tickerRow?.analyst_target != null ? Number(tickerRow.analyst_target) : undefined;
  const analystAvg =
    typeof payload.analystAvg === "string"
      ? payload.analystAvg
      : tickerRow?.analyst_average != null
        ? String(tickerRow.analyst_average)
        : undefined;
  const marketCap =
    payload.marketCap != null ? Number(payload.marketCap) : tickerRow?.market_cap != null ? Number(tickerRow.market_cap) : undefined;
  const peg =
    payload.peg != null ? Number(payload.peg) : tickerRow?.peg_ratio != null ? Number(tickerRow.peg_ratio) : undefined;
  const isETF =
    payload.isETF != null ? Boolean(payload.isETF) : tickerRow?.is_etf != null ? Boolean(tickerRow.is_etf) : false;
  const aiSentimentScore =
    sentimentRow?.sentiment_score != null ? Number(sentimentRow.sentiment_score) : undefined;

  const baseStock: IosStockInput = {
    symbol,
    quantity: clampNumber(payload.quantity ?? 0, 0, 0, 1_000_000_000),
    averageCost: clampNumber(payload.averageCost ?? 0, 0, 0, 1_000_000_000),
    lastPrice: closes.at(-1),
    shortSMA: 50,
    dynamicFactor: 20,
    stockLimit: 0,
    transactionLimit: 0,
    isETF,
    analystTarget,
    analystAvg,
    marketCap,
    peg,
    aiSentimentScore,
    enableRSIReversalGate,
    rsiPeriod,
    rsiOversoldThreshold,
    rsiOverboughtThreshold,
    rsiHysteresisPoints,
    rsiMinRisingDays,
  };
  const score = baseStock.isETF ? undefined : computeRiskReturnScore(baseStock);
  const limits = calculateTradingLimits(portfolioSize, isETF, score, watchlistCount);

  const inputs: SimulationInputs = {
    symbol,
    closes,
    isETF,
    analystTarget,
    analystAvg,
    marketCap,
    peg,
    aiSentimentScore,
    enableRSIReversalGate,
    rsiPeriod,
    rsiOversoldThreshold,
    rsiOverboughtThreshold,
    rsiHysteresisPoints,
    rsiMinRisingDays,
    etfProfitTargetPercent,
    stockProfitTargetPercent,
    useRSIGating,
  };

  const smaValues = [50, 200];
  const dynamicFactorValues = [10, 15, 20, 25];
  let bestReturn = Number.NEGATIVE_INFINITY;
  let bestParams: { shortSMA: number; dynamicFactor: number } | null = null;

  for (const shortSMA of smaValues) {
    if (closes.length <= shortSMA) continue;
    for (const dynamicFactor of dynamicFactorValues) {
      const totalReturn = simulateStrategyReturn(inputs, {
        shortSMA,
        dynamicFactor,
        stockLimit: limits.stockLimit,
        transactionLimit: limits.transactionLimit,
      });
      if (totalReturn > bestReturn) {
        bestReturn = totalReturn;
        bestParams = { shortSMA, dynamicFactor };
      }
    }
  }

  if (!bestParams || !Number.isFinite(bestReturn)) {
    return jsonError(`Unable to optimize ${symbol} with the available historical data.`, 422);
  }

  return NextResponse.json({
    ok: true,
    symbol,
    simulationYears,
    score: score ?? null,
    bestReturn,
    strategy: {
      shortSMA: bestParams.shortSMA,
      dynamicFactor: bestParams.dynamicFactor,
      stockLimit: limits.stockLimit,
      transactionLimit: limits.transactionLimit,
      pendingOptimization: false,
    },
  });
}
