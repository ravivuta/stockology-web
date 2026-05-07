import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  computeIosRecommendation,
  computeRiskReturnScore,
  type IosStockInput,
} from "@/lib/ios-recommendation";

type HistoryRow = {
  date: string;
  close: number | null;
};

type TradeRecord = {
  date: string;
  action: string;
  price: number;
  profit: number | null;
};

type SellTargetReference =
  | {
      source: "Analyst Target" | "Manual Target";
      value: number;
      summary: string;
    }
  | {
      source: "Profit Target";
      percent: number;
      summary: string;
    };

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function resolveSellTargetReference(args: {
  analystTarget?: number;
  manualTarget?: number;
  isETF: boolean;
  etfProfitTargetPercent: number;
  stockProfitTargetPercent: number;
}): SellTargetReference {
  const analystTarget = args.analystTarget != null && args.analystTarget > 0 ? args.analystTarget : undefined;
  const manualTarget = args.manualTarget != null && args.manualTarget > 0 ? args.manualTarget : undefined;

  if (analystTarget != null) {
    return {
      source: "Analyst Target",
      value: analystTarget,
      summary: `$${analystTarget.toFixed(2)}`,
    };
  }

  if (manualTarget != null) {
    return {
      source: "Manual Target",
      value: manualTarget,
      summary: `$${manualTarget.toFixed(2)}`,
    };
  }

  const percent = args.isETF ? args.etfProfitTargetPercent : args.stockProfitTargetPercent;
  return {
    source: "Profit Target",
    percent,
    summary: `${percent.toFixed(0)}% gain (your setting)`,
  };
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

  const years = Math.trunc(clampNumber(payload.years ?? 1, 1, 1, 4));
  const capital = clampNumber(payload.capital ?? 10000, 10000, 1000, 10_000_000);
  const shortSMA = Math.trunc(clampNumber(payload.shortSMA ?? 50, 50, 2, 500));
  const dynamicFactor = clampNumber(payload.dynamicFactor ?? 20, 20, 0, 100);
  const stockLimit = clampNumber(payload.stockLimit ?? capital / 2, capital / 2, 1, 10_000_000);
  const transactionLimit = clampNumber(payload.transactionLimit ?? Math.min(2500, stockLimit), Math.min(2500, stockLimit), 1, 10_000_000);
  const etfProfitTargetPercent = clampNumber(payload.etfProfitTargetPercent ?? 50, 50, 0, 500);
  const stockProfitTargetPercent = clampNumber(payload.stockProfitTargetPercent ?? 50, 50, 0, 500);
  const useRSIGating = payload.useRSIGating == null ? true : Boolean(payload.useRSIGating);
  const manualTarget = payload.targetPrice != null ? Number(payload.targetPrice) : undefined;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return jsonError("Supabase configuration is missing", 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const historyDays = years * 252 + shortSMA + 80;
  const [{ data: historyData, error: historyError }, { data: tickerRow }, { data: sentimentRow }] = await Promise.all([
    supabase.rpc("get_historical_prices", { p_symbol: symbol, p_days: historyDays }),
    supabase
      .from("ticker_data")
      .select("symbol, analyst_average, market_cap, peg_ratio, analyst_target, company_name, is_etf")
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

  const history = ((historyData ?? []) as HistoryRow[])
    .map((row) => ({
      date: String(row.date).slice(0, 10),
      close: Number(row.close),
    }))
    .filter((row) => row.date && Number.isFinite(row.close) && row.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (history.length <= shortSMA) {
    return jsonError(`Insufficient historical data for ${symbol}. Need more than ${shortSMA} daily closes.`);
  }

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
  const sellTargetReference = resolveSellTargetReference({
    analystTarget,
    manualTarget,
    isETF,
    etfProfitTargetPercent,
    stockProfitTargetPercent,
  });

  let cash = capital;
  let shares = 0;
  let positionAvg: number | null = null;
  let wins = 0;
  let totalTrades = 0;
  let buySignals = 0;
  let sellSignals = 0;
  let maxValue = cash;
  let maxDrawdown = 0;
  const returns: number[] = [];
  const trades: TradeRecord[] = [];

  for (let index = shortSMA; index < history.length; index += 1) {
    const current = history[index];
    if (!current) continue;
    const recentCloses = history.slice(Math.max(0, index - shortSMA), index).map((row) => row.close);
    const stock: IosStockInput = {
      symbol,
      quantity: shares,
      averageCost: positionAvg ?? 0,
      lastPrice: current.close,
      shortSMA,
      dynamicFactor,
      stockLimit,
      transactionLimit,
      isETF,
      analystTarget,
      analystAvg,
      marketCap,
      peg,
      aiSentimentScore,
      enableRSIReversalGate:
        payload.enableRSIReversalGate == null ? true : Boolean(payload.enableRSIReversalGate),
      rsiPeriod: payload.rsiPeriod != null ? Number(payload.rsiPeriod) : 14,
      rsiOversoldThreshold: payload.rsiOversoldThreshold != null ? Number(payload.rsiOversoldThreshold) : 30,
      rsiOverboughtThreshold: payload.rsiOverboughtThreshold != null ? Number(payload.rsiOverboughtThreshold) : 70,
      rsiHysteresisPoints: payload.rsiHysteresisPoints != null ? Number(payload.rsiHysteresisPoints) : 5,
      rsiMinRisingDays: payload.rsiMinRisingDays != null ? Number(payload.rsiMinRisingDays) : 2,
    };
    stock.score = stock.isETF ? undefined : computeRiskReturnScore(stock);

    const rec = computeIosRecommendation(stock, {
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
      analystTarget != null && analystTarget > 0 && current.close > 0
        ? ((analystTarget - current.close) / current.close) * 100 >= 25
        : true;

    if (rec.action === "BUY" && positionAvg == null) {
      const sharesToBuy = Math.floor(Math.min(cash, transactionLimit) / current.close);
      if (sharesToBuy > 0 && hasEnoughUpside) {
        shares = sharesToBuy;
        cash -= sharesToBuy * current.close;
        positionAvg = current.close;
        buySignals += 1;
        trades.push({ date: current.date, action: rec.action, price: current.close, profit: null });
      }
    } else if (rec.action === "ADD" && positionAvg != null && hasEnoughUpside) {
      const sharesToBuy = Math.floor(Math.min(cash, transactionLimit) / current.close);
      if (sharesToBuy > 0) {
        const totalCost: number = shares * positionAvg + sharesToBuy * current.close;
        shares += sharesToBuy;
        positionAvg = totalCost / shares;
        cash -= sharesToBuy * current.close;
        buySignals += 1;
        trades.push({ date: current.date, action: rec.action, price: current.close, profit: null });
      }
    } else if (rec.action === "SELL" && positionAvg != null && shares > 0) {
      const profit = (current.close - positionAvg) * shares;
      cash += shares * current.close;
      sellSignals += 1;
      totalTrades += 1;
      if (profit > 0) wins += 1;
      trades.push({ date: current.date, action: rec.action, price: current.close, profit });
      returns.push(((current.close - positionAvg) / positionAvg) * 100);
      shares = 0;
      positionAvg = null;
    } else if (rec.action === "REDUCE" && positionAvg != null && shares > 0) {
      const costBasis = shares * positionAvg;
      const unrealizedGain = (current.close - positionAvg) * shares;
      const moneyToFree = costBasis - stockLimit;
      const sharesToReduce =
        moneyToFree > transactionLimit && unrealizedGain > moneyToFree
          ? Math.floor(moneyToFree / current.close)
          : 0;
      if (sharesToReduce > 0 && sharesToReduce < shares) {
        const profit = (current.close - positionAvg) * sharesToReduce;
        cash += sharesToReduce * current.close;
        shares -= sharesToReduce;
        trades.push({
          date: current.date,
          action: `${rec.action} ${sharesToReduce}`,
          price: current.close,
          profit,
        });
      }
    }

    const value = cash + shares * current.close;
    if (value > maxValue) maxValue = value;
    maxDrawdown = Math.max(maxDrawdown, ((maxValue - value) / Math.max(maxValue, 0.0001)) * 100);
  }

  const finalClose = history.at(-1)?.close ?? 0;
  const finalDate = history.at(-1)?.date ?? "";
  if (positionAvg != null && shares > 0 && finalClose > 0) {
    const profit = (finalClose - positionAvg) * shares;
    cash += shares * finalClose;
    sellSignals += 1;
    totalTrades += 1;
    if (profit > 0) wins += 1;
    trades.push({ date: finalDate, action: "SELL (Close)", price: finalClose, profit });
    returns.push(((finalClose - positionAvg) / positionAvg) * 100);
    shares = 0;
    positionAvg = null;
  }

  const startPrice = history[0]?.close ?? 0;
  const endingValue = cash;
  const totalReturn = capital > 0 ? ((endingValue - capital) / capital) * 100 : 0;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const avgProfitPerTrade =
    totalTrades > 0
      ? trades.filter((trade) => trade.profit != null).reduce((sum, trade) => sum + (trade.profit ?? 0), 0) / totalTrades
      : 0;
  const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance =
    returns.length > 1
      ? returns.reduce((sum, value) => sum + (value - meanReturn) ** 2, 0) / (returns.length - 1)
      : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? meanReturn / stdDev : 0;

  return NextResponse.json({
    ok: true,
    symbol,
    years,
    strategy: {
      shortSMA,
      dynamicFactor,
      stockLimit,
      transactionLimit,
      useRSIGating,
      etfProfitTargetPercent,
      stockProfitTargetPercent,
      analystTarget: analystTarget ?? null,
      isETF,
    },
    criteriaUsed: {
      shortSMA,
      dynamicFactor,
      stockLimit,
      transactionLimit,
      sellTargetReference,
      considered: [
        "ETF/Stock profit target settings",
        "RSI gate on/off setting",
        "Stock-level strategy parameters (SMA, dynamic factor, limits)",
      ],
      notConsidered: [
        "AI Sentiment (latest news digest)",
        "Sell-only long-term-qualified toggle",
        "Wash-sale rule",
        "Score/no-auto-buy gating",
      ],
    },
    result: {
      periodDescription: `${years} year${years > 1 ? "s" : ""}`,
      totalTrades,
      buySignals,
      sellSignals,
      startPrice,
      endPrice: finalClose,
      totalReturn,
      winRate,
      avgProfitPerTrade,
      maxDrawdown,
      sharpeRatio,
      trades,
    },
  });
}
