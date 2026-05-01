/**
 * Risk-return score and recommendation rules aligned with the current iOS app:
 * `UnifiedDataStore.calculateScore` + `RecommendationEngine.compute`.
 */

export type IosOpenLot = {
  purchaseDate?: string;
  quantity?: number;
  costBasis?: number;
  status?: string;
};

export type IosSoldLot = {
  saleDate?: string;
  quantity?: number;
  salePrice?: number;
  realizedGainLoss?: number;
};

export type IosStockInput = {
  symbol: string;
  quantity: number;
  averageCost: number;
  lastPrice?: number;
  shortSMA: number;
  dynamicFactor: number;
  stockLimit: number;
  transactionLimit: number;
  isETF?: boolean;
  analystTarget?: number;
  analystAvg?: string;
  marketCap?: number;
  peg?: number;
  score?: number;
  aiSentimentScore?: number;
  movingAvg?: number;
  isShortlisted?: boolean;
  isInWatchlistSize?: boolean;
  suppressTradeActions?: boolean;
  enableRSIReversalGate?: boolean;
  rsiPeriod?: number;
  rsiOversoldThreshold?: number;
  rsiOverboughtThreshold?: number;
  rsiHysteresisPoints?: number;
  rsiMinRisingDays?: number;
  openLots?: IosOpenLot[];
  soldLots?: IosSoldLot[];
};

export type IosRecOut = {
  action: string;
  comments: string;
  nextBuyPrice: number;
  movingAvg: number;
  expectedReturnPct: number;
};

export type IosRecOptions = {
  closes?: number[];
  etfProfitTargetPercent?: number;
  stockProfitTargetPercent?: number;
  skipWashSaleCheck?: boolean;
  relaxScoreRequirement?: boolean;
  useAISentiment?: boolean;
  useRSIGating?: boolean;
  sellOnlyLongTermQualified?: boolean;
};

export type WashSaleInfo = {
  canBuy: boolean;
  restrictedUntil: Date | null;
  daysRemaining: number;
  restrictingLoss: number | null;
  displayText: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const UNKNOWN_PURCHASE_DATE_MAX_MS = 2 * DAY_MS;

export function sma(values: number[], window: number): number {
  if (window <= 0 || values.length === 0) return 0;
  const w = Math.min(window, values.length);
  const slice = values.slice(-w);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function rsiSeries(values: number[], period: number): number[] {
  if (period <= 1 || values.length <= period) return [];

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    gains.push(Math.max(delta, 0));
    losses.push(Math.max(-delta, 0));
  }

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  const out: number[] = [];
  const firstRsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  out.push(firstRsi);

  for (let i = period; i < gains.length; i += 1) {
    avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
    avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    out.push(rsi);
  }

  return out;
}

export function passesRSIReversalWithHysteresis(
  closes: number[],
  period: number,
  oversoldThreshold: number,
  hysteresisPoints: number,
  minRisingDays: number
): boolean {
  const safePeriod = Math.max(2, period);
  const safeRisingDays = Math.max(1, minRisingDays);
  const safeHysteresis = Math.max(0, hysteresisPoints);
  const series = rsiSeries(closes, safePeriod);
  if (series.length < safeRisingDays + 1) return false;

  const lookback = Math.min(series.length, Math.max(10, safePeriod * 2));
  const recent = series.slice(-lookback);
  let troughIndex = -1;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    if (recent[i] < oversoldThreshold) {
      troughIndex = i;
      break;
    }
  }
  if (troughIndex < 0) return false;

  const trough = recent[troughIndex];
  const postTrough = recent.slice(troughIndex);
  if (postTrough.length < safeRisingDays + 1) return false;

  const currentRSI = postTrough[postTrough.length - 1] ?? 0;
  const amplitudeRecovered = currentRSI - trough >= safeHysteresis;

  for (let offset = 0; offset < safeRisingDays; offset += 1) {
    const right = postTrough.length - 1 - offset;
    const left = right - 1;
    if (postTrough[right] <= postTrough[left]) return false;
  }
  return amplitudeRecovered;
}

export function passesRSISellSignalWithHysteresis(
  closes: number[],
  period: number,
  overboughtThreshold: number,
  hysteresisPoints: number,
  minFallingDays: number
): boolean {
  const safePeriod = Math.max(2, period);
  const safeFallingDays = Math.max(1, minFallingDays);
  const safeHysteresis = Math.max(0, hysteresisPoints);
  const series = rsiSeries(closes, safePeriod);
  if (series.length < safeFallingDays + 1) return false;

  const lookback = Math.min(series.length, Math.max(10, safePeriod * 2));
  const recent = series.slice(-lookback);
  let peakIndex = -1;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    if (recent[i] > overboughtThreshold) {
      peakIndex = i;
      break;
    }
  }
  if (peakIndex < 0) return false;

  const peak = recent[peakIndex];
  const postPeak = recent.slice(peakIndex);
  if (postPeak.length < safeFallingDays + 1) return false;

  const currentRSI = postPeak[postPeak.length - 1] ?? 100;
  const amplitudeDeclined = peak - currentRSI >= safeHysteresis;

  for (let offset = 0; offset < safeFallingDays; offset += 1) {
    const right = postPeak.length - 1 - offset;
    const left = right - 1;
    if (postPeak[right] >= postPeak[left]) return false;
  }
  return amplitudeDeclined;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

export function isUnknownPurchaseDate(date: Date | null): boolean {
  if (!date) return true;
  return date.getTime() < UNKNOWN_PURCHASE_DATE_MAX_MS;
}

export function getOldestOpenLotDate(stock: IosStockInput): Date | null {
  const dates = (stock.openLots ?? [])
    .map((lot) => parseDate(lot.purchaseDate))
    .filter((date): date is Date => date != null)
    .sort((a, b) => a.getTime() - b.getTime());
  return dates[0] ?? null;
}

export function getWashSaleInfo(stock: IosStockInput, now = new Date()): WashSaleInfo {
  let restrictedUntil: Date | null = null;
  let restrictingLoss: number | null = null;

  for (const sold of stock.soldLots ?? []) {
    const saleDate = parseDate(sold.saleDate);
    const realized = Number(sold.realizedGainLoss ?? 0);
    if (!saleDate || !Number.isFinite(realized) || realized >= 0) continue;
    const ageMs = now.getTime() - saleDate.getTime();
    if (ageMs < 0 || ageMs > 30 * DAY_MS) continue;
    const end = new Date(saleDate.getTime() + 30 * DAY_MS);
    if (end.getTime() > now.getTime() && (!restrictedUntil || end.getTime() > restrictedUntil.getTime())) {
      restrictedUntil = end;
      restrictingLoss = realized;
    }
  }

  const canBuy = restrictedUntil == null;
  const daysRemaining =
    restrictedUntil == null ? 0 : Math.max(0, Math.ceil((restrictedUntil.getTime() - now.getTime()) / DAY_MS));
  let displayText = "✅ Can buy (no wash sale restriction)";
  if (!canBuy && restrictedUntil && restrictingLoss != null) {
    displayText = `🚫 Cannot buy until ${restrictedUntil.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })} (Wash sale rule - loss of $${Math.abs(restrictingLoss).toFixed(2)})\nDays remaining: ${daysRemaining}`;
  } else if (!canBuy) {
    displayText = "🚫 Cannot buy (wash sale restriction active)";
  }

  return { canBuy, restrictedUntil, daysRemaining, restrictingLoss, displayText };
}

/** 0-100 composite; ETFs return undefined (matches iOS metrics). */
export function computeRiskReturnScore(stock: IosStockInput): number | undefined {
  if (stock.isETF) return undefined;

  let total = 0;
  const usesPEG = (stock.peg ?? 0) > 0;
  const analystWeight = usesPEG ? 30 : 40;
  const upsideWeight = usesPEG ? 30 : 40;

  const analystAvg = stock.analystAvg?.trim();
  if (analystAvg) {
    const avgRating = parseFloat(analystAvg);
    if (Number.isFinite(avgRating)) total += (avgRating / 5) * analystWeight;
  }

  const lp = stock.lastPrice ?? 0;
  const at = stock.analystTarget;
  if (at != null && at > 0 && lp > 0) {
    const upsidePercent = ((at - lp) / lp) * 100;
    total += Math.min(Math.max((upsidePercent / 100) * upsideWeight, 0), upsideWeight);
  }

  const marketCap = stock.marketCap;
  if (marketCap != null && marketCap > 0) {
    if (marketCap >= 200_000_000_000) total += 20;
    else if (marketCap >= 50_000_000_000) total += 15;
    else if (marketCap >= 10_000_000_000) total += 10;
    else if (marketCap >= 1_000_000_000) total += 5;
  }

  if (!stock.isETF) {
    const pegRatio = stock.peg ?? 0;
    if (pegRatio > 0) {
      if (pegRatio < 1) total += 20;
      else if (pegRatio < 1.5) total += 16;
      else if (pegRatio < 2) total += 12;
      else if (pegRatio < 3) total += 8;
      else if (pegRatio < 5) total += 4;
      else total += 1;
    }
  }

  return total;
}

export function ratingTextForScore(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Very Good";
  if (score >= 70) return "Good";
  if (score >= 60) return "Fair";
  if (score >= 50) return "Poor";
  if (score >= 0) return "Very Poor";
  return "Unknown";
}

export function sentimentLabelForScore(score: number): string {
  if (score >= 70) return "Bullish";
  if (score >= 55) return "Mildly Bullish";
  if (score >= 45) return "Neutral";
  if (score >= 30) return "Mildly Bearish";
  return "Bearish";
}

function estimateReduceQty(
  currentPrice: number,
  costBasis: number,
  stockLimit: number,
  transactionLimit: number,
  unrealizedGain: number,
  analystTarget: number | undefined,
  avgPrice: number
): number {
  const moneyToFree = costBasis - stockLimit;
  const threshold = analystTarget != null && analystTarget > 0 ? 0.75 * analystTarget : 1.25 * avgPrice;
  if (
    moneyToFree > transactionLimit &&
    unrealizedGain > moneyToFree / 2 &&
    currentPrice > threshold
  ) {
    return Math.round(unrealizedGain / Math.max(currentPrice, 0.0001));
  }
  return 0;
}

function generateReduceComment(stock: IosStockInput, reduceQty: number): string {
  let comment = `Consider diversifying. Reduce your holding size by selling some stocks - sell ${reduceQty} shares to reduce cost basis`;
  const oldestLot = (stock.openLots ?? [])
    .map((lot) => ({ ...lot, purchaseDateObj: parseDate(lot.purchaseDate) }))
    .filter((lot): lot is IosOpenLot & { purchaseDateObj: Date } => lot.purchaseDateObj != null)
    .sort((a, b) => a.purchaseDateObj.getTime() - b.purchaseDateObj.getTime())[0];

  if (oldestLot?.purchaseDateObj) {
    const isLongTerm = Date.now() - oldestLot.purchaseDateObj.getTime() > 365 * DAY_MS;
    comment = `${isLongTerm ? "Long-Term Holding" : "Short-Term Holding"}: ${comment}`;
  }

  return comment;
}

function generateSellComment(stock: IosStockInput, targetPrice: number): string {
  let comment = `Price above target sell price $${targetPrice.toFixed(2)}`;
  const oldest = getOldestOpenLotDate(stock);
  if (oldest && !isUnknownPurchaseDate(oldest)) {
    const isLongTerm = Date.now() - oldest.getTime() > 365 * DAY_MS;
    comment = `${isLongTerm ? "Long-Term Holding" : "Short-Term Holding"}: ${comment}`;
  }
  return comment;
}

/**
 * Mirrors `filterStocksByRiskAppetite(..., includeScoreThreshold: false)` for a single stock.
 */
export function stockPassesRiskFilter(
  stock: IosStockInput,
  risk: "Low" | "Medium" | "High",
  enableRiskFilter: boolean,
  upsidePercent?: number | null
): boolean {
  if (!enableRiskFilter) return true;
  const isHolding = stock.quantity > 0;
  const isETF = stock.isETF === true;
  if (isHolding || isETF) return true;

  const marketCap = stock.marketCap ?? 0;
  const analystRating = parseFloat(stock.analystAvg ?? "0") || 0;
  const score = stock.score ?? 0;
  const lowCap = 100_000_000_000;
  const mediumCap = 50_000_000_000;
  const up = upsidePercent ?? 0;

  switch (risk) {
    case "Low":
      return marketCap >= lowCap && analystRating >= 4.5;
    case "Medium": {
      const meetsLow = marketCap >= lowCap && analystRating >= 4.5;
      const meetsMedium = marketCap >= mediumCap && analystRating >= 4;
      return meetsLow || meetsMedium;
    }
    case "High": {
      const meetsLow = marketCap >= lowCap && analystRating >= 4.5;
      const meetsMedium = marketCap >= mediumCap && analystRating >= 4 && score >= 50;
      const hasHighUpside = up > 25;
      const smallerCapOk = marketCap >= 10_000_000_000 && analystRating >= 3.5;
      const meetsHigh = (hasHighUpside || smallerCapOk) && score >= 40;
      return meetsLow || meetsMedium || meetsHigh;
    }
    default:
      return true;
  }
}

export function recommendedWatchlistSize(portfolioSize: number): number {
  const clamped = Math.max(10000, Math.min(1000000, portfolioSize));
  const stocks = 7 + ((clamped - 10000) / 990000) * 68;
  return Math.max(7, Math.min(75, Math.round(stocks)));
}

export type RecFactor = { label: string; detail: string; passes: boolean };

export type RecommendationFactorOptions = {
  skipWashSale?: boolean;
  useRSIGating?: boolean;
  sellOnlyLongTermQualified?: boolean;
  closes?: number[];
};

export function computeRecommendationFactors(
  stock: IosStockInput,
  rec: IosRecOut,
  options: RecommendationFactorOptions = {}
): RecFactor[] {
  const {
    skipWashSale = false,
    useRSIGating = true,
    sellOnlyLongTermQualified = false,
    closes = [],
  } = options;
  const factors: RecFactor[] = [];
  const currentPrice = stock.lastPrice ?? 0;
  const isETF = stock.isETF === true;
  const score = stock.score ?? 0;
  const isShortlisted = stock.isShortlisted ?? (stock.quantity > 0 || stock.isETF === true);
  const aiScore = stock.aiSentimentScore;
  const avgPrice = stock.averageCost;
  const quantity = stock.quantity;
  const costBasis = quantity * avgPrice;
  const stockLimit = stock.stockLimit;
  const unrealizedGain = (currentPrice - avgPrice) * quantity;
  const action = rec.action.toUpperCase();

  factors.push({
    label: "Shortlisted",
    detail: isShortlisted ? "Yes" : "Not in top watchlist",
    passes: isShortlisted,
  });

  if (stock.quantity > 0) {
    factors.push({
      label: "Trade actions enabled",
      detail: stock.suppressTradeActions ? "Suppressed by per-stock preference" : "Enabled",
      passes: stock.suppressTradeActions !== true,
    });
  }

  switch (action) {
    case "BUY":
    case "WAIT_BUY":
      if (rec.movingAvg > 0) {
        factors.push({
          label: `Price below ${stock.shortSMA}-day SMA`,
          detail: `$${currentPrice.toFixed(2)} vs $${rec.movingAvg.toFixed(2)}`,
          passes: currentPrice <= rec.movingAvg,
        });
      }
      break;
    case "ADD":
    case "WAIT_ADD":
      if (rec.nextBuyPrice > 0) {
        factors.push({
          label: "Price below next buy target",
          detail: `$${currentPrice.toFixed(2)} vs $${rec.nextBuyPrice.toFixed(2)}`,
          passes: currentPrice <= rec.nextBuyPrice,
        });
      }
      break;
    case "SELL":
      if (stock.analystTarget != null && stock.analystTarget > 0) {
        factors.push({
          label: "Price at/above analyst target",
          detail: `$${currentPrice.toFixed(2)} ≥ $${stock.analystTarget.toFixed(2)}`,
          passes: currentPrice >= stock.analystTarget,
        });
      }
      break;
    case "REDUCE":
    case "WAIT_REDUCE": {
      const moneyToFree = Math.max(0, costBasis - stockLimit);
      factors.push({
        label: "Cost basis above limit",
        detail: `$${Math.round(costBasis)} > $${Math.round(stockLimit)}`,
        passes: costBasis > stockLimit,
      });
      factors.push({
        label: "Unrealized gain sufficient to reduce",
        detail: `Gain $${Math.round(unrealizedGain)} vs needed $${Math.round(moneyToFree / 2)}`,
        passes: unrealizedGain > moneyToFree / 2,
      });
      break;
    }
    default:
      break;
  }

  if (["BUY", "ADD", "WAIT_BUY", "WAIT_ADD"].includes(action)) {
    if (!isETF) {
      factors.push({
        label: "Score ≥ 50",
        detail: `${score.toFixed(1)}/100`,
        passes: score >= 50,
      });
      factors.push({
        label: "Expected return > 25%",
        detail: `${rec.expectedReturnPct.toFixed(1)}%`,
        passes: rec.expectedReturnPct > 25,
      });
      const aiPass = aiScore == null || !(aiScore > 0) || aiScore >= 50;
      factors.push({
        label: "AI sentiment OK (≥ 50)",
        detail:
          aiScore != null && aiScore > 0
            ? `${aiScore.toFixed(0)}/100 — ${sentimentLabelForScore(aiScore)}`
            : "N/A — not blocking",
        passes: aiPass,
      });
    }

    const maxHoldingLimit = 2 * stockLimit;
    factors.push({
      label: "Holding limit OK",
      detail: `$${Math.round(costBasis)} of $${Math.round(maxHoldingLimit)} max`,
      passes: costBasis < maxHoldingLimit,
    });

    if (useRSIGating && closes.length > 0) {
      const passesRsi = passesRSIReversalWithHysteresis(
        closes,
        stock.rsiPeriod ?? 14,
        stock.rsiOversoldThreshold ?? 30,
        stock.rsiHysteresisPoints ?? 5,
        stock.rsiMinRisingDays ?? 2
      );
      factors.push({
        label: "RSI reversal confirmed",
        detail: stock.enableRSIReversalGate === false ? "Per-stock RSI gate disabled" : passesRsi ? "Momentum reversal confirmed" : "Waiting for reversal confirmation",
        passes: stock.enableRSIReversalGate === false ? true : passesRsi,
      });
    }

    factors.push({
      label: "Wash sale clear",
      detail: skipWashSale ? "Skipped" : getWashSaleInfo(stock).displayText,
      passes: skipWashSale ? true : getWashSaleInfo(stock).canBuy,
    });
  }

  if (["SELL", "REDUCE", "WAIT_REDUCE"].includes(action) && sellOnlyLongTermQualified && stock.quantity > 0) {
    const oldest = getOldestOpenLotDate(stock);
    const passesLongTerm =
      oldest != null &&
      !isUnknownPurchaseDate(oldest) &&
      Date.now() - oldest.getTime() > 365 * DAY_MS;
    factors.push({
      label: "Long-term sale qualified",
      detail:
        oldest == null || isUnknownPurchaseDate(oldest)
          ? "No dated open lot available"
          : passesLongTerm
            ? "Oldest open lot held more than 365 days"
            : "Oldest open lot held less than 365 days",
      passes: passesLongTerm,
    });
  }

  if (["REDUCE", "WAIT_REDUCE"].includes(action) && useRSIGating && closes.length > 0 && stock.quantity > 0) {
    const passesSellRsi = passesRSISellSignalWithHysteresis(
      closes,
      stock.rsiPeriod ?? 14,
      stock.rsiOverboughtThreshold ?? 70,
      stock.rsiHysteresisPoints ?? 5,
      stock.rsiMinRisingDays ?? 2
    );
    factors.push({
      label: "RSI trim signal",
      detail: passesSellRsi ? "Overbought reversal confirmed" : "No overbought reversal confirmation",
      passes: passesSellRsi,
    });
  }

  return factors;
}

export function scoreBreakdownRows(stock: IosStockInput): {
  analystLine: string;
  analystPoints: string;
  upsideLine: string;
  upsidePoints: string;
  capLine: string;
  capPoints: string;
  pegLine: string;
  pegPoints: string;
} {
  const lp = stock.lastPrice ?? 0;
  const usesPEG = (stock.peg ?? 0) > 0 && stock.isETF !== true;
  const analystWeight = usesPEG ? 30 : 40;
  const upsideWeight = usesPEG ? 30 : 40;

  let analystPoints = 0;
  const aa = stock.analystAvg?.trim();
  if (aa) {
    const ar = parseFloat(aa);
    if (Number.isFinite(ar)) analystPoints = (ar / 5) * analystWeight;
  }

  let upsidePct: number | null = null;
  let upsidePoints = 0;
  if (stock.analystTarget != null && lp > 0) {
    upsidePct = ((stock.analystTarget - lp) / lp) * 100;
    upsidePoints = Math.min(Math.max((upsidePct / 100) * upsideWeight, 0), upsideWeight);
  }

  let capScore = 0;
  const mc = stock.marketCap;
  if (mc != null && mc > 0) {
    if (mc >= 200_000_000_000) capScore = 20;
    else if (mc >= 50_000_000_000) capScore = 15;
    else if (mc >= 10_000_000_000) capScore = 10;
    else if (mc >= 1_000_000_000) capScore = 5;
  }

  let pegPoints = 0;
  const peg = stock.peg ?? 0;
  if (!stock.isETF && peg > 0) {
    if (peg < 1) pegPoints = 20;
    else if (peg < 1.5) pegPoints = 16;
    else if (peg < 2) pegPoints = 12;
    else if (peg < 3) pegPoints = 8;
    else if (peg < 5) pegPoints = 4;
    else pegPoints = 1;
  }

  return {
    analystLine: aa ? `${aa}/5.0` : "—",
    analystPoints: `${analystPoints.toFixed(1)}/${analystWeight}`,
    upsideLine: upsidePct != null ? `${upsidePct.toFixed(1)}%` : "—",
    upsidePoints: `${upsidePoints.toFixed(1)}/${upsideWeight}`,
    capLine: mc != null && mc > 0 ? `$${(mc / 1_000_000_000).toFixed(1)}B` : "—",
    capPoints: `${capScore.toFixed(1)}/20`,
    pegLine: peg > 0 ? peg.toFixed(2) : "—",
    pegPoints: `${pegPoints.toFixed(1)}/20`,
  };
}

export function computeIosRecommendation(stock: IosStockInput, options: IosRecOptions = {}): IosRecOut {
  const {
    closes = [],
    etfProfitTargetPercent = 50,
    stockProfitTargetPercent = 50,
    skipWashSaleCheck = false,
    relaxScoreRequirement = false,
    useAISentiment = true,
    useRSIGating = true,
    sellOnlyLongTermQualified = false,
  } = options;

  const currentPrice = stock.lastPrice ?? 0;
  const stockLimit = stock.stockLimit ?? 10000;
  const transactionLimit = stock.transactionLimit ?? 2500;
  const shortSMAPeriod = stock.shortSMA ?? 50;
  const dynamicFactor = stock.dynamicFactor ?? 20;

  if (currentPrice <= 0) {
    return {
      action: stock.quantity === 0 ? "WAIT_BUY" : "WAIT_ADD",
      comments: "Unable to fetch current price. Pull down to refresh or try again later.",
      nextBuyPrice: 0,
      movingAvg: 0,
      expectedReturnPct: 0,
    };
  }

  let movingAvg: number;
  let actualSmaPeriod: number;
  const pre = stock.movingAvg;
  if (pre != null && pre > 0) {
    movingAvg = pre;
    actualSmaPeriod = shortSMAPeriod;
  } else {
    const minClosesRequired = 25;
    if (closes.length < minClosesRequired) {
      const nextBuyPrice = stock.averageCost || currentPrice;
      return {
        action: stock.quantity === 0 ? "WAIT_BUY" : "WAIT_ADD",
        comments: `Insufficient historical data (${closes.length}/${minClosesRequired} days). Pull down to refresh or try again later.`,
        nextBuyPrice,
        movingAvg: 0,
        expectedReturnPct: 0,
      };
    }
    actualSmaPeriod = closes.length >= shortSMAPeriod ? shortSMAPeriod : Math.max(25, closes.length);
    movingAvg = sma(closes, actualSmaPeriod);
  }

  const numStock = stock.quantity;
  const avgPrice = stock.averageCost;

  let numberPurchases = 0;
  if (transactionLimit > 0 && numStock > 0) {
    numberPurchases = Math.round((numStock * avgPrice) / transactionLimit);
  }
  const rawBuyFactor = numberPurchases === 0 ? 1 : 1 - dynamicFactor / 100 - (2 * numberPurchases) / 100;
  const buyFactorSMA = Math.max(0.1, rawBuyFactor);

  const nextBuyPrice = numStock === 0 || avgPrice <= 0 ? movingAvg : avgPrice * buyFactorSMA;

  let targetPrice: number | undefined;
  if (stock.analystTarget != null && stock.analystTarget > 0) {
    targetPrice = stock.analystTarget;
  } else if (stock.isETF) {
    const priceBase = avgPrice > 0 ? avgPrice : relaxScoreRequirement ? currentPrice : 0;
    targetPrice = priceBase > 0 ? priceBase * (1 + etfProfitTargetPercent / 100) : undefined;
  } else {
    const priceBase = avgPrice > 0 ? avgPrice : relaxScoreRequirement ? currentPrice : 0;
    targetPrice = priceBase > 0 ? priceBase * (1 + stockProfitTargetPercent / 100) : undefined;
  }

  const expectedReturnPct =
    targetPrice != null ? ((targetPrice - currentPrice) / Math.max(currentPrice, 0.0001)) * 100 : 0;

  const costBasis = numStock * avgPrice;
  const unrealizedGain = (currentPrice - avgPrice) * numStock;
  const reduceQty = estimateReduceQty(
    currentPrice,
    costBasis,
    stockLimit,
    transactionLimit,
    unrealizedGain,
    stock.analystTarget,
    avgPrice
  );

  const metricScore = stock.score ?? 0;
  const washSaleInfo = skipWashSaleCheck ? null : getWashSaleInfo(stock);
  const shouldApplyAISentimentGate = useAISentiment && !relaxScoreRequirement && stock.isETF !== true;
  const rsiGateEnabled = useRSIGating && (stock.enableRSIReversalGate ?? true);
  const rsiPeriod = stock.rsiPeriod ?? 14;
  const rsiOversoldThreshold = stock.rsiOversoldThreshold ?? 30;
  const rsiOverboughtThreshold = stock.rsiOverboughtThreshold ?? 70;
  const rsiHysteresisPoints = stock.rsiHysteresisPoints ?? 5;
  const rsiMinRisingDays = stock.rsiMinRisingDays ?? 2;
  const maxAccumulationLimit = 2 * stockLimit;

  if (!relaxScoreRequirement && stock.suppressTradeActions === true) {
    return {
      action: numStock === 0 ? "WAIT_BUY" : "WAIT_ADD",
      comments: "Action recommendations (BUY/ADD/REDUCE/SELL) suppressed by your preference for this stock.",
      nextBuyPrice,
      movingAvg,
      expectedReturnPct,
    };
  }

  let passesLongTermCheckForSell = true;
  if (sellOnlyLongTermQualified && numStock > 0) {
    const oldest = getOldestOpenLotDate(stock);
    passesLongTermCheckForSell =
      oldest != null &&
      !isUnknownPurchaseDate(oldest) &&
      Date.now() - oldest.getTime() > 365 * DAY_MS;
  }

  if (numStock > 0 && rsiGateEnabled && currentPrice > avgPrice && passesLongTermCheckForSell) {
    const passesRsiSell = passesRSISellSignalWithHysteresis(
      closes,
      rsiPeriod,
      rsiOverboughtThreshold,
      rsiHysteresisPoints,
      rsiMinRisingDays
    );
    if (passesRsiSell && reduceQty > 0) {
      const currentRSI = rsiSeries(closes, rsiPeriod).at(-1) ?? 50;
      return {
        action: "REDUCE",
        comments: `RSI overbought reversal (RSI: ${currentRSI.toFixed(0)}/100) — trim ${reduceQty.toFixed(0)} shares to lock in partial gains while keeping position for continued upside.`,
        nextBuyPrice,
        movingAvg,
        expectedReturnPct,
      };
    }
  }

  if (numStock > 0 && targetPrice != null && currentPrice >= targetPrice && passesLongTermCheckForSell) {
    return {
      action: "SELL",
      comments: generateSellComment(stock, targetPrice),
      nextBuyPrice,
      movingAvg,
      expectedReturnPct,
    };
  }

  const gateReturnAndScore =
    relaxScoreRequirement || stock.isETF === true || (expectedReturnPct > 25 && metricScore > 50);

  if (
    currentPrice <= nextBuyPrice &&
    costBasis < maxAccumulationLimit &&
    currentPrice < transactionLimit &&
    gateReturnAndScore
  ) {
    if (rsiGateEnabled) {
      const passesRSIGate = passesRSIReversalWithHysteresis(
        closes,
        rsiPeriod,
        rsiOversoldThreshold,
        rsiHysteresisPoints,
        rsiMinRisingDays
      );
      if (!passesRSIGate) {
        return {
          action: "WAIT_ADD",
          comments:
            "RSI reversal gate active above stock limit: wait for oversold momentum to reverse with hysteresis confirmation before adding more.",
          nextBuyPrice,
          movingAvg,
          expectedReturnPct,
        };
      }
    }

    if (!skipWashSaleCheck && washSaleInfo && !washSaleInfo.canBuy) {
      return {
        action: numStock === 0 ? "WAIT_BUY" : "WAIT_ADD",
        comments: washSaleInfo.displayText,
        nextBuyPrice,
        movingAvg,
        expectedReturnPct,
      };
    }

    if (shouldApplyAISentimentGate) {
      const ai = stock.aiSentimentScore;
      if (ai != null && ai > 0 && ai < 50) {
        const label = ai < 30 ? "Bearish" : ai < 45 ? "Mildly Bearish" : "Cautious";
        return {
          action: numStock === 0 ? "WAIT_BUY" : "WAIT_ADD",
          comments: `AI Sentiment (latest news digest) is ${label} (${ai.toFixed(0)}/100) — overriding buy recommendation`,
          nextBuyPrice,
          movingAvg,
          expectedReturnPct,
        };
      }
    }

    if (numStock === 0) {
      const suggestedShares = Math.round(transactionLimit / currentPrice);
      return {
        action: "BUY",
        comments: `Buy ${suggestedShares.toFixed(0)} stocks. Current Price is below ${actualSmaPeriod.toFixed(0)} day moving avg ${movingAvg.toFixed(2)}`,
        nextBuyPrice,
        movingAvg,
        expectedReturnPct,
      };
    }

    if (metricScore < 50) {
      return {
        action: "WAIT_ADD",
        comments: `Score ${metricScore.toFixed(0)}/100 below threshold (50) for adding to position. Wait for improvement.`,
        nextBuyPrice,
        movingAvg,
        expectedReturnPct,
      };
    }

    const addQty = Math.round(transactionLimit / currentPrice);
    return {
      action: "ADD",
      comments: `Add ${addQty.toFixed(0)} stocks. Current price is below next target buy price ${nextBuyPrice.toFixed(2)}`,
      nextBuyPrice,
      movingAvg,
      expectedReturnPct,
    };
  }

  let passesLongTermCheckForReduce = true;
  if (sellOnlyLongTermQualified && numStock > 0) {
    const oldest = getOldestOpenLotDate(stock);
    passesLongTermCheckForReduce =
      oldest != null &&
      !isUnknownPurchaseDate(oldest) &&
      Date.now() - oldest.getTime() > 365 * DAY_MS;
  }

  if (numStock > 0 && costBasis > stockLimit && reduceQty > 0 && currentPrice > movingAvg && passesLongTermCheckForReduce) {
    return {
      action: "REDUCE",
      comments: generateReduceComment(stock, reduceQty),
      nextBuyPrice,
      movingAvg,
      expectedReturnPct,
    };
  }

  if (numStock === 0) {
    const blockers: string[] = [];
    if (currentPrice > nextBuyPrice) {
      blockers.push(`price is above ${actualSmaPeriod.toFixed(0)}-day moving average (${movingAvg.toFixed(2)})`);
    }
    if (stock.isETF !== true && !relaxScoreRequirement) {
      if (expectedReturnPct <= 25) {
        blockers.push(`expected return ${expectedReturnPct.toFixed(1)}% is at/below 25% minimum`);
      }
      if (metricScore <= 50) {
        blockers.push(`score ${metricScore.toFixed(0)}/100 is at/below 50 minimum`);
      }
    }
    if (currentPrice >= transactionLimit) {
      blockers.push(`share price exceeds per-trade limit (${transactionLimit.toFixed(2)})`);
    }
    return {
      action: "WAIT_BUY",
      comments:
        blockers.length === 0
          ? `Waiting for entry conditions to align. Next buy trigger: ${nextBuyPrice.toFixed(2)}.`
          : `WAIT due to: ${blockers.join("; ")}.`,
      nextBuyPrice,
      movingAvg,
      expectedReturnPct,
    };
  }

  if (costBasis >= maxAccumulationLimit) {
    return {
      action: "WAIT_ADD",
      comments: "Current exposure has reached the 2x Stock Limit averaging-down cap. Wait to reduce position on strength before adding more.",
      nextBuyPrice,
      movingAvg,
      expectedReturnPct,
    };
  }

  return {
    action: "WAIT_ADD",
    comments: `Add more shares when price is below next target buy price: ${nextBuyPrice.toFixed(2)}`,
    nextBuyPrice,
    movingAvg,
    expectedReturnPct,
  };
}
