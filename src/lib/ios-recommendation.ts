/**
 * Risk-return score and recommendation rules aligned with the current iOS app:
 * `UnifiedDataStore.calculateScore` + `RecommendationEngine.compute`.
 */

import { formatCurrency } from "@/lib/numberFormat";

export type IosOpenLot = {
  purchaseDate?: string;
  quantity?: number;
  costBasis?: number;
  status?: string;
  isRetirementAccount?: boolean | null;
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
  returnOnEquity?: number;
  profitMargin?: number;
  debtToEquity?: number;
  score?: number;
  aiSentimentScore?: number;
  aiSentimentLastUpdated?: string; // ISO8601 timestamp
  movingAvg?: number;
  isShortlisted?: boolean;
  isInWatchlistSize?: boolean;
  suppressTradeActions?: boolean;
  excludeFromShortlist?: boolean;
  enableRSIReversalGate?: boolean;
  rsiPeriod?: number;
  rsiOversoldThreshold?: number;
  rsiOverboughtThreshold?: number;
  rsiHysteresisPoints?: number;
  rsiMinRisingDays?: number;
  openLots?: IosOpenLot[];
  soldLots?: IosSoldLot[];
};

function pegNormalized(pegRatio: number): number {
  if (pegRatio < 1) return 1.0;
  if (pegRatio < 1.5) return 0.8;
  if (pegRatio < 2) return 0.6;
  if (pegRatio < 3) return 0.4;
  if (pegRatio < 5) return 0.2;
  return 0.05;
}

function roeNormalized(roe: number): number {
  if (roe >= 0.5) return 1.0;
  if (roe >= 0.4) return 0.8;
  if (roe >= 0.3) return 0.6;
  if (roe >= 0.2) return 0.4;
  if (roe >= 0.1) return 0.2;
  return 0.0;
}

function marginNormalized(margin: number): number {
  if (margin >= 0.5) return 1.0;
  if (margin >= 0.4) return 0.8;
  if (margin >= 0.3) return 0.6;
  if (margin >= 0.2) return 0.4;
  if (margin >= 0.1) return 0.2;
  return 0.0;
}

function debtToEquityNormalized(debtToEquity: number): number {
  if (debtToEquity < 0.5) return 1.0;
  if (debtToEquity <= 1.0) return 0.8;
  if (debtToEquity <= 1.8) return 0.6;
  if (debtToEquity <= 3.0) return 0.4;
  if (debtToEquity <= 5.0) return 0.2;
  return 0.0;
}

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
  rsiPeriod?: number;
  rsiOversoldThreshold?: number;
  rsiOverboughtThreshold?: number;
  rsiHysteresisPoints?: number;
  rsiMinRisingDays?: number;
  sellOnlyLongTermQualified?: boolean;
  useTraderMode?: boolean;
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

export function getOldestTaxableGainLotDate(stock: IosStockInput, currentPrice: number): Date | null {
  const dates = (stock.openLots ?? [])
    .filter((lot) => lot.isRetirementAccount !== true && typeof lot.costBasis === "number" && lot.costBasis < currentPrice)
    .map((lot) => parseDate(lot.purchaseDate))
    .filter((date): date is Date => date != null)
    .sort((a, b) => a.getTime() - b.getTime());
  return dates[0] ?? null;
}

export function retirementOpenQuantity(stock: IosStockInput): number {
  return (stock.openLots ?? [])
    .filter((lot) => lot.isRetirementAccount === true)
    .reduce((sum, lot) => sum + Math.max(0, lot.quantity ?? 0), 0);
}

function isLongTermLot(lot: IosOpenLot, now = Date.now()): boolean {
  const date = parseDate(lot.purchaseDate);
  if (!date || isUnknownPurchaseDate(date)) return false;
  return now - date.getTime() > 365 * DAY_MS;
}

export function taxAwareEligibleReduceQuantity(stock: IosStockInput, currentPrice: number): number {
  return (stock.openLots ?? [])
    .filter((lot) => (lot.quantity ?? 0) > 1e-6)
    .reduce((sum, lot) => {
      const qty = Math.max(0, lot.quantity ?? 0);
      if (lot.isRetirementAccount === true) return sum + qty;
      const cost = lot.costBasis;
      if (typeof cost === "number" && cost > currentPrice) return sum + qty;
      if (isLongTermLot(lot)) return sum + qty;
      return sum;
    }, 0);
}

export function passesLongTermCheckForReduce(
  stock: IosStockInput,
  currentPrice: number,
  reduceQty: number,
  sellOnlyLongTermQualified: boolean
): boolean {
  if (!sellOnlyLongTermQualified) return true;
  if (reduceQty <= 1e-6) return true;
  return taxAwareEligibleReduceQuantity(stock, currentPrice) + 1e-6 >= reduceQty;
}

export function getWashSaleInfo(stock: IosStockInput, now = new Date()): WashSaleInfo {
  const washSaleRestrictionDays = 30;
  const soldLotRetentionDays = 90;

  let restrictedUntil: Date | null = null;
  let restrictingLoss: number | null = null;

  for (const sold of stock.soldLots ?? []) {
    const saleDate = parseDate(sold.saleDate);
    const realized = Number(sold.realizedGainLoss ?? 0);
    if (!saleDate || !Number.isFinite(realized) || realized >= 0) continue;
    const ageMs = now.getTime() - saleDate.getTime();
    if (ageMs < 0 || ageMs > soldLotRetentionDays * DAY_MS) continue;
    const end = new Date(saleDate.getTime() + washSaleRestrictionDays * DAY_MS);
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
    })} (Wash sale rule - loss of ${formatCurrency(Math.abs(restrictingLoss))})\nDays remaining: ${daysRemaining}`;
  } else if (!canBuy) {
    displayText = "🚫 Cannot buy (wash sale restriction active)";
  }

  return { canBuy, restrictedUntil, daysRemaining, restrictingLoss, displayText };
}

/**
 * 0-100 composite; ETFs return undefined (matches iOS metrics).
 * Leftover upside vs the analyst target is not scored; it remains a BUY/ADD gate.
 * With quality metrics: Analyst 40 + Market Cap 20 + Quality 40.
 * Fallback: Analyst 60 + Market Cap 40.
 */
export function computeRiskReturnScore(stock: IosStockInput): number | undefined {
  if (stock.isETF) return undefined;

  let total = 0;
  const qualityComponents: number[] = [];
  const peg = stock.peg ?? 0;
  if (peg > 0) qualityComponents.push(pegNormalized(peg));
  if (stock.returnOnEquity != null && Number.isFinite(stock.returnOnEquity)) {
    qualityComponents.push(roeNormalized(stock.returnOnEquity));
  }
  if (stock.profitMargin != null && Number.isFinite(stock.profitMargin)) {
    qualityComponents.push(marginNormalized(stock.profitMargin));
  }
  if (stock.debtToEquity != null && Number.isFinite(stock.debtToEquity) && stock.debtToEquity >= 0) {
    qualityComponents.push(debtToEquityNormalized(stock.debtToEquity));
  }

  const hasQualityBucket = qualityComponents.length > 0;
  const analystWeight = hasQualityBucket ? 40 : 60;
  const marketCapWeight = hasQualityBucket ? 20 : 40;
  const qualityWeight = hasQualityBucket ? 40 : 0;

  const analystAvg = stock.analystAvg?.trim();
  if (analystAvg) {
    const avgRating = parseFloat(analystAvg);
    if (Number.isFinite(avgRating)) total += (avgRating / 5) * analystWeight;
  }

  const marketCap = stock.marketCap;
  if (marketCap != null && marketCap > 0) {
    if (marketCap >= 200_000_000_000) total += marketCapWeight;
    else if (marketCap >= 50_000_000_000) total += marketCapWeight * 0.75;
    else if (marketCap >= 10_000_000_000) total += marketCapWeight * 0.5;
    else if (marketCap >= 1_000_000_000) total += marketCapWeight * 0.25;
  }

  if (qualityWeight > 0 && qualityComponents.length > 0) {
    const averageQuality = qualityComponents.reduce((sum, v) => sum + v, 0) / qualityComponents.length;
    total += averageQuality * qualityWeight;
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
  unrealizedGain: number
): number {
  const moneyToFree = costBasis - stockLimit;
  if (
    moneyToFree > transactionLimit &&
    unrealizedGain > moneyToFree / 2
  ) {
    return Math.round(unrealizedGain / Math.max(currentPrice, 0.0001));
  }
  return 0;
}

function lotDateMs(lot: IosOpenLot): number {
  const date = parseDate(lot.purchaseDate);
  if (!date || isUnknownPurchaseDate(date)) return 0;
  return date.getTime();
}

function formatShareCount(qty: number): string {
  if (!Number.isFinite(qty)) return "0";
  if (Math.abs(qty - Math.round(qty)) < 1e-6) return String(Math.round(qty));
  return qty.toFixed(2);
}

function formatLotDate(lot: IosOpenLot): string {
  const date = parseDate(lot.purchaseDate);
  if (!date || isUnknownPurchaseDate(date)) return "missing date";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function generateReduceComment(stock: IosStockInput, reduceQty: number, taxAware = false): string {
  const currentPrice = stock.lastPrice ?? stock.averageCost;
  const openLots = (stock.openLots ?? []).filter((lot) => (lot.quantity ?? 0) > 1e-6);

  const retirementLots = openLots
    .filter((lot) => lot.isRetirementAccount === true)
    .sort((a, b) => lotDateMs(a) - lotDateMs(b));
  const taxableLots = openLots
    .filter((lot) => lot.isRetirementAccount !== true)
    .sort((a, b) => lotDateMs(a) - lotDateMs(b));

  let comment = `Consider diversifying. Reduce your holding size by selling some stocks - sell ${formatShareCount(reduceQty)} shares to reduce cost basis`;

  const lotsToSell: Array<{ lot: IosOpenLot; qtyFromLot: number; bucket: string }> = [];
  let remainingQty = reduceQty;

  const take = (lots: IosOpenLot[], bucket: string) => {
    for (const lot of lots) {
      if (remainingQty <= 1e-6) return;
      const qtyFromThisLot = Math.min(remainingQty, lot.quantity ?? 0);
      lotsToSell.push({ lot, qtyFromLot: qtyFromThisLot, bucket });
      remainingQty -= qtyFromThisLot;
    }
  };

  take(retirementLots, "retirement");
  if (remainingQty > 1e-6) {
    if (taxAware) {
      take(
        taxableLots.filter((lot) => typeof lot.costBasis === "number" && lot.costBasis > currentPrice),
        "taxableLoss"
      );
      take(
        taxableLots.filter(
          (lot) => !(typeof lot.costBasis === "number" && lot.costBasis > currentPrice) && isLongTermLot(lot)
        ),
        "taxableLongTerm"
      );
    } else {
      take(taxableLots, "taxable");
    }
  }

  const qtyIn = (bucket: string) =>
    lotsToSell.filter((item) => item.bucket === bucket).reduce((sum, item) => sum + item.qtyFromLot, 0);
  const firstIn = (bucket: string) => lotsToSell.find((item) => item.bucket === bucket)?.lot;

  const parts: string[] = [];
  const retirementQty = qtyIn("retirement");
  const taxableLossQty = qtyIn("taxableLoss");
  const taxableLongTermQty = qtyIn("taxableLongTerm");
  const taxableOtherQty = qtyIn("taxable");

  if (retirementQty > 1e-6) {
    const firstRetirement = firstIn("retirement");
    const dateNote = firstRetirement ? ` from ${formatLotDate(firstRetirement)}` : "";
    parts.push(`${formatShareCount(retirementQty)} retirement shares first (no tax)${dateNote}`);
  }
  if (taxableLossQty > 1e-6) {
    const firstLoss = firstIn("taxableLoss");
    const dateNote = firstLoss ? formatLotDate(firstLoss) : "missing date";
    const prefix = parts.length > 0 ? "then " : "";
    parts.push(`${prefix}${formatShareCount(taxableLossQty)} taxable loss shares from ${dateNote}`);
  }
  if (taxableLongTermQty > 1e-6) {
    const firstLongTerm = firstIn("taxableLongTerm");
    const dateNote = firstLongTerm ? formatLotDate(firstLongTerm) : "missing date";
    const prefix = parts.length > 0 ? "then " : "";
    parts.push(`${prefix}${formatShareCount(taxableLongTermQty)} oldest long-term taxable shares from ${dateNote}`);
  }
  if (taxableOtherQty > 1e-6) {
    const firstTaxable = firstIn("taxable");
    const dateNote = firstTaxable ? formatLotDate(firstTaxable) : "missing date";
    const prefix = parts.length > 0 ? "then " : "";
    parts.push(`${prefix}${formatShareCount(taxableOtherQty)} oldest taxable shares from ${dateNote}`);
  }
  if (parts.length > 0) {
    comment += `. Target lots: ${parts.join(", ")}`;
  }

  const durationLot =
    lotsToSell.find((item) => item.lot.isRetirementAccount !== true)?.lot ?? lotsToSell[0]?.lot;
  const durationDate = durationLot ? parseDate(durationLot.purchaseDate) : null;
  if (durationDate && !isUnknownPurchaseDate(durationDate)) {
    const isLongTerm = Date.now() - durationDate.getTime() > 365 * DAY_MS;
    comment = `${isLongTerm ? "Long-Term Holding" : "Short-Term Holding"}: ${comment}`;
  }

  return comment;
}

function generateSellComment(stock: IosStockInput, targetPrice: number): string {
  let comment = `Price above target sell price ${formatCurrency(targetPrice)}`;
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
export function stockPassesRiskAppetiteOnly(
  stock: IosStockInput,
  risk: "Low" | "Medium" | "High",
  upsidePercent?: number | null
): boolean {
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
      const meetsMedium = marketCap >= mediumCap && analystRating >= 4 && (score === 0 || score >= 50);
      const hasHighUpside = up > 25;
      const smallerCapOk = marketCap >= 10_000_000_000 && analystRating >= 3.5;
      const meetsHigh = (hasHighUpside || smallerCapOk) && (score === 0 || score >= 40);
      return meetsLow || meetsMedium || meetsHigh;
    }
    default:
      return true;
  }
}

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
  return stockPassesRiskAppetiteOnly(stock, risk, upsidePercent);
}

export function recommendedWatchlistSize(portfolioSize: number): number {
  const clamped = Math.max(10000, Math.min(1000000, portfolioSize));
  const stocks = 7 + ((clamped - 10000) / 990000) * 68;
  return Math.max(7, Math.min(75, Math.round(stocks)));
}

export type AddGateContext = {
  enableRiskFilter: boolean;
  limitWatchlistSize: boolean;
  riskAppetite: "Low" | "Medium" | "High";
  portfolioSize: number;
  cashBalance?: number;
  allStocks: IosStockInput[];
};

/** Non-ETF names that compete for top-N. Risk Low/Medium/High is applied first when enabled. Rank N of N is included. */
export function rankedTopWatchlistCandidates(
  stocks: IosStockInput[],
  options?: { enableRiskFilter?: boolean; riskAppetite?: "Low" | "Medium" | "High" }
): IosStockInput[] {
  return stocks
    .filter((stock) => stock.isETF !== true && stock.excludeFromShortlist !== true)
    .filter((stock) => {
      if (!options?.enableRiskFilter) return true;
      return stockPassesRiskAppetiteOnly(stock, options.riskAppetite ?? "Medium", upsidePct(stock));
    })
    .filter((stock) => (stock.score ?? 0) > 50)
    .sort((a, b) => {
      const cmp = (b.score ?? 0) - (a.score ?? 0);
      return cmp === 0 ? a.symbol.localeCompare(b.symbol) : cmp;
    });
}

function rankInTopWatchlist(
  stocks: IosStockInput[],
  symbol: string,
  ctx?: AddGateContext
): number | null {
  const ranked = rankedTopWatchlistCandidates(stocks, ctx);
  const index = ranked.findIndex((stock) => stock.symbol === symbol);
  return index >= 0 ? index + 1 : null;
}

function upsidePct(stock: IosStockInput): number {
  const price = stock.lastPrice ?? 0;
  const target = stock.analystTarget ?? 0;
  if (price <= 0 || target <= 0) return 0;
  return ((target - price) / price) * 100;
}

/** Holdings stay shortlisted; ADD still requires enabled risk/top-N gates. */
export function holdingQualifiesForAdd(stock: IosStockInput, ctx: AddGateContext): boolean {
  if (stock.excludeFromShortlist === true) return false;

  if (ctx.enableRiskFilter && !stockPassesRiskAppetiteOnly(stock, ctx.riskAppetite, upsidePct(stock))) {
    return false;
  }

  if (ctx.limitWatchlistSize) {
    if (stock.isETF === true) return true;
    if ((stock.score ?? 0) <= 50) return false;
    const rank = rankInTopWatchlist(ctx.allStocks, stock.symbol, ctx);
    const size = recommendedWatchlistSize(ctx.portfolioSize);
    if (rank == null || rank > size) return false;
  }

  return true;
}

export function suppressAddIfHoldingOutsideGates<T extends IosRecOut>(
  rec: T | undefined,
  stock: IosStockInput,
  ctx: AddGateContext
): T | undefined {
  if (!rec || stock.quantity <= 0) return rec;
  if (rec.action !== "ADD" && rec.action !== "WAIT_ADD") return rec;
  if (holdingQualifiesForAdd(stock, ctx)) return rec;
  return {
    ...rec,
    action: "WAIT_ADD",
    comments:
      "ADD paused: this holding is outside the enabled shortlist rank/risk gates. REDUCE and SELL can still apply.",
  };
}

/** Same red Portfolio names: non-ETF holdings outside top N when shortlist + risk are on. */
export function holdingIsOutsideEnabledShortlistAndRisk(
  stock: IosStockInput,
  ctx: AddGateContext
): boolean {
  if (!ctx.limitWatchlistSize || !ctx.enableRiskFilter) return false;
  if (stock.quantity <= 0 || stock.isETF === true || stock.excludeFromShortlist === true) return false;
  const size = recommendedWatchlistSize(ctx.portfolioSize);
  const rank = rankInTopWatchlist(ctx.allStocks, stock.symbol, ctx);
  return rank == null || rank > size;
}

/**
 * Holdings shown in red (outside shortlist/risk) should SELL the full position
 * when unrealized gain % is already larger than leftover upside %, or when the
 * position is in profit and available cash is under 20% of portfolio size.
 */
export function offloadHoldingOutsideShortlistIfNeeded<T extends IosRecOut>(
  rec: T | undefined,
  stock: IosStockInput,
  ctx: AddGateContext,
  options?: { sellOnlyLongTermQualified?: boolean; nowMs?: number }
): T | undefined {
  const gated = suppressAddIfHoldingOutsideGates(rec, stock, ctx);
  if (!gated || stock.quantity <= 0) return gated;
  if (!holdingIsOutsideEnabledShortlistAndRisk(stock, ctx)) return gated;
  if (stock.suppressTradeActions === true) return gated;

  const lastPrice = stock.lastPrice ?? 0;
  const averageCost = stock.averageCost ?? 0;
  const gainPct = averageCost > 0 ? ((lastPrice - averageCost) / averageCost) * 100 : 0;
  const upside = upsidePct(stock);
  const cashShareOfPortfolio =
    ctx.portfolioSize > 0 && ctx.cashBalance != null ? ctx.cashBalance / ctx.portfolioSize : 1;
  const cashIsTight = cashShareOfPortfolio < 0.2;
  const gainBeatsUpside = gainPct > upside;
  const cashRaiseWhileInProfit = lastPrice > averageCost && cashIsTight;
  if (!(gainBeatsUpside || cashRaiseWhileInProfit)) return gated;

  if (options?.sellOnlyLongTermQualified) {
    const oldest = getOldestTaxableGainLotDate(stock, lastPrice);
    const now = options.nowMs ?? Date.now();
    if (oldest && !isUnknownPurchaseDate(oldest) && now - oldest.getTime() <= 365 * DAY_MS) {
      return gated;
    }
  }

  const cashText = (cashShareOfPortfolio * 100).toFixed(0);
  const comments =
    gainBeatsUpside && cashRaiseWhileInProfit
      ? `Outside shortlist/risk gates. Unrealized gain is ${gainPct.toFixed(1)}% vs leftover upside ${upside.toFixed(1)}%, and cash is ${cashText}% of portfolio size (under 20%) — SELL to offload the entire position.`
      : cashRaiseWhileInProfit
        ? `Outside shortlist/risk gates with an unrealized gain, and cash is ${cashText}% of portfolio size (under 20%) — SELL to offload the entire position.`
        : `Outside shortlist/risk gates. Unrealized gain is ${gainPct.toFixed(1)}% vs leftover upside ${upside.toFixed(1)}% — SELL to offload the entire position.`;

  return {
    ...gated,
    action: "SELL",
    comments,
  };
}

/**
 * Mirrors iOS `Stock.calculateLimits(...)`.
 */
export function calculateTradingLimits(
  portfolioSize: number,
  isETF?: boolean,
  score?: number | null,
  watchlistSize = 10,
  marketCap?: number | null,
  beta?: number | null
): { stockLimit: number; transactionLimit: number } {
  void beta;
  const safeWatchlistSize = Math.max(1, Math.round(watchlistSize) || 1);
  const baseStockLimit = Math.max(0, portfolioSize) / safeWatchlistSize;

  let riskMultiplier = 1;
  if (isETF === true) {
    riskMultiplier = 10;
  } else {
    // Conservative adjustment: apply 2/3 multiplier by default
    // Only give full allocation to confirmed large/mega caps (≥$10B)
    if (marketCap != null && marketCap >= 10_000_000_000) {
      riskMultiplier = 1.0;  // Full size for large/mega cap
    } else {
      riskMultiplier = 2.0 / 3.0;  // ~0.67× for small/micro cap or unknown
    }
  }

  const stockLimit = baseStockLimit * riskMultiplier;
  const transactionLimit = stockLimit * (isETF === true ? 0.1 : 0.25);
  return { stockLimit, transactionLimit };
}

export type RecFactor = { label: string; detail: string; passes: boolean };

export type RecommendationFactorOptions = {
  skipWashSale?: boolean;
  useRSIGating?: boolean;
  useAISentiment?: boolean;
  rsiPeriod?: number;
  rsiOversoldThreshold?: number;
  rsiOverboughtThreshold?: number;
  rsiHysteresisPoints?: number;
  rsiMinRisingDays?: number;
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
    useAISentiment = true,
    rsiPeriod = 14,
    rsiOversoldThreshold = 30,
    rsiOverboughtThreshold = 70,
    rsiHysteresisPoints = 5,
    rsiMinRisingDays = 2,
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
  const transactionLimit = stock.transactionLimit;
  const unrealizedGain = (currentPrice - avgPrice) * quantity;
  const action = rec.action.toUpperCase();

  factors.push({
    label: "Shortlisted",
    detail: isShortlisted ? "Yes" : "Not in top watchlist",
    passes: isShortlisted,
  });

  if (stock.excludeFromShortlist === true) {
    factors.push({
      label: "User override: Excluded from Shortlist",
      detail: "You excluded this stock — no recommendations generated",
      passes: false,
    });
  }

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
          detail: `${formatCurrency(currentPrice)} vs ${formatCurrency(rec.movingAvg)}`,
          passes: currentPrice <= rec.movingAvg,
        });
      }
      break;
    case "ADD":
    case "WAIT_ADD":
      if (rec.nextBuyPrice > 0) {
        factors.push({
          label: "Price below next buy target",
          detail: `${formatCurrency(currentPrice)} vs ${formatCurrency(rec.nextBuyPrice)}`,
          passes: currentPrice <= rec.nextBuyPrice,
        });
      }
      break;
    case "SELL":
      const isRsiOverboughtLeftoverSell = rec.comments.includes("leftover upside");
      if (isRsiOverboughtLeftoverSell) {
        factors.push({
          label: "Leftover upside < 10% (Trader)",
          detail: `${rec.expectedReturnPct.toFixed(1)}% remaining to target`,
          passes: rec.expectedReturnPct < 10,
        });
      }
      if (!rec.comments.includes("RSI overbought reversal") && !isRsiOverboughtLeftoverSell && stock.analystTarget != null && stock.analystTarget > 0) {
        factors.push({
          label: "Price at/above Analyst Target (Median)",
          detail: `${formatCurrency(currentPrice)} ≥ ${formatCurrency(stock.analystTarget)}`,
          passes: currentPrice >= stock.analystTarget,
        });
      }
      if (useAISentiment && !isETF) {
        const lastUpdated = stock.aiSentimentLastUpdated ? new Date(stock.aiSentimentLastUpdated) : null;
        const isFresh = lastUpdated && (Date.now() - lastUpdated.getTime()) < (3 * 24 * 60 * 60 * 1000);
        
        let aiPass: boolean;
        let detail: string;
        
        if (aiScore != null && aiScore > 0) {
          if (isFresh) {
            // Fresh sentiment - apply normal gating (< 65 doesn't block sell)
            aiPass = aiScore < 65;
            detail = `${aiScore.toFixed(0)}/100 — ${sentimentLabelForScore(aiScore)}`;
          } else {
            // Stale sentiment - ignore for gating
            aiPass = true;
            const age = lastUpdated ? Math.floor((Date.now() - lastUpdated.getTime()) / (24 * 60 * 60 * 1000)) : 99;
            detail = `${aiScore.toFixed(0)}/100 — Stale (${age}d old), not used`;
          }
        } else {
          // No sentiment available
          aiPass = true;
          detail = "N/A — not blocking";
        }
        
        factors.push({
          label: "AI sentiment not blocking sell (< 65)",
          detail,
          passes: aiPass,
        });
      }
      break;
    case "REDUCE":
    case "WAIT_REDUCE": {
      if (costBasis > stockLimit) {
        const moneyToFree = Math.max(0, costBasis - stockLimit);
        factors.push({
          label: "Cost basis above limit",
          detail: `${formatCurrency(costBasis)} > ${formatCurrency(stockLimit)}`,
          passes: costBasis > stockLimit,
        });
        factors.push({
          label: "Excess investment is significant (> Transaction limit)?",
          detail: `${formatCurrency(moneyToFree)} > ${formatCurrency(transactionLimit)}`,
          passes: moneyToFree > transactionLimit,
        });
        const gainNeeded = moneyToFree / 2;
        const gainTriggerPrice = quantity > 0 ? avgPrice + gainNeeded / quantity : 0;
        factors.push({
          label: "Unrealized gain sufficient to reduce",
          detail: `Gain ${formatCurrency(unrealizedGain)} vs needed ${formatCurrency(gainNeeded)}${gainTriggerPrice > 0 ? ` (triggers at ${formatCurrency(gainTriggerPrice)})` : ""}`,
          passes: unrealizedGain > gainNeeded,
        });
      }
      break;
    }
    default:
      break;
  }

  if (["BUY", "ADD", "WAIT_BUY", "WAIT_ADD"].includes(action)) {
    if (!isETF) {
      // Only show score factor if score > 0 (skip when no fundamentals available)
      if (score > 0) {
        factors.push({
          label: "Score ≥ 50",
          detail: `${score.toFixed(1)}/100`,
          passes: score >= 50,
        });
      }
      factors.push({
        label: "Expected return > 25%",
        detail: `${rec.expectedReturnPct.toFixed(1)}%`,
        passes: rec.expectedReturnPct > 25,
      });
      if (useAISentiment) {
        const lastUpdated = stock.aiSentimentLastUpdated ? new Date(stock.aiSentimentLastUpdated) : null;
        const isFresh = lastUpdated && (Date.now() - lastUpdated.getTime()) < (3 * 24 * 60 * 60 * 1000);
        
        let aiPass: boolean;
        let detail: string;
        
        if (aiScore != null && aiScore > 0) {
          if (isFresh) {
            // Fresh sentiment - apply normal gating
            aiPass = aiScore >= 50;
            detail = `${aiScore.toFixed(0)}/100 — ${sentimentLabelForScore(aiScore)}`;
          } else {
            // Stale sentiment - ignore for gating
            aiPass = true;
            const age = lastUpdated ? Math.floor((Date.now() - lastUpdated.getTime()) / (24 * 60 * 60 * 1000)) : 99;
            detail = `${aiScore.toFixed(0)}/100 — Stale (${age}d old), not used`;
          }
        } else {
          // No sentiment available
          aiPass = true;
          detail = "N/A — not blocking";
        }
        
        factors.push({
          label: "AI sentiment OK (≥ 50)",
          detail,
          passes: aiPass,
        });
      }
    }

    const maxHoldingLimit = 2 * stockLimit;
    factors.push({
      label: "Holding limit OK",
      detail: `${formatCurrency(costBasis)} of ${formatCurrency(maxHoldingLimit)} max`,
      passes: costBasis < maxHoldingLimit,
    });

    factors.push({
      label: "Wash sale clear",
      detail: skipWashSale
        ? "Skipped"
        : getWashSaleInfo(stock).canBuy
          ? "No restriction active"
          : `Restricted until ${getWashSaleInfo(stock).restrictedUntil?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) ?? "unknown"}`,
      passes: skipWashSale ? true : getWashSaleInfo(stock).canBuy,
    });
  }

  if (["SELL", "REDUCE", "WAIT_REDUCE"].includes(action) && sellOnlyLongTermQualified && stock.quantity > 0) {
    if (action === "REDUCE" || action === "WAIT_REDUCE") {
      const reduceQty = estimateReduceQty(currentPrice, costBasis, stockLimit, transactionLimit, unrealizedGain);
      const coveredByRetirement = reduceQty > 1e-6 && retirementOpenQuantity(stock) + 1e-6 >= reduceQty;
      const passesLongTerm = passesLongTermCheckForReduce(stock, currentPrice, reduceQty, true);
      let detail: string;
      if (coveredByRetirement) {
        detail = "Reduce quantity available from retirement lots (no tax holding-period gate)";
      } else if (passesLongTerm) {
        detail = "Reduce quantity available from retirement lots, taxable lots at a loss, and/or long-term taxable lots";
      } else if (taxAwareEligibleReduceQuantity(stock, currentPrice) > 1e-6) {
        detail = "Trim would require short-term taxable gains; tax-aware REDUCE is waiting";
      } else {
        detail = "No tax-aware lots available for REDUCE (retirement, taxable loss, or long-term)";
      }
      factors.push({
        label: "Long-term sale qualified",
        detail,
        passes: passesLongTerm,
      });
    } else {
      const oldest = getOldestTaxableGainLotDate(stock, currentPrice);
      const passesLongTerm =
        oldest == null || isUnknownPurchaseDate(oldest)
          ? true
          : Date.now() - oldest.getTime() > 365 * DAY_MS;
      factors.push({
        label: "Long-term sale qualified",
        detail:
          oldest == null || isUnknownPurchaseDate(oldest)
            ? "No dated taxable gain lot available; gate not blocking"
            : passesLongTerm
              ? "Oldest taxable gain lot held more than 365 days"
              : "Oldest taxable gain lot held less than 365 days",
        passes: passesLongTerm,
      });
    }
  }

  const clampedRsiPeriod = Math.max(2, Math.min(30, rsiPeriod));
  const clampedOversoldThreshold = Math.max(10, Math.min(50, rsiOversoldThreshold));
  const clampedOverboughtThreshold = Math.max(50, Math.min(90, rsiOverboughtThreshold));
  const clampedHysteresisPoints = Math.max(0, Math.min(20, rsiHysteresisPoints));
  const clampedRsiMinRisingDays = Math.max(1, Math.min(5, rsiMinRisingDays));
  const rsiCurrentValue = rsiSeries(closes, clampedRsiPeriod).at(-1);
  if (rsiCurrentValue != null) {
    const rsiGateEnabled = useRSIGating;
    if (rsiGateEnabled) {
      const buyReversalDetected = passesRSIReversalWithHysteresis(
        closes,
        clampedRsiPeriod,
        clampedOversoldThreshold,
        clampedHysteresisPoints,
        clampedRsiMinRisingDays
      );
      const sellReversalDetected = passesRSISellSignalWithHysteresis(
        closes,
        clampedRsiPeriod,
        clampedOverboughtThreshold,
        clampedHysteresisPoints,
        clampedRsiMinRisingDays
      );
      const isRSIBlockedForCurrentRecommendation = rec.comments.includes("RSI reversal gate active");
      const rsiValueText = rsiCurrentValue.toFixed(0);

      let statusLabel = `Non-blocking | RSI ${rsiValueText}`;
      let passesStatus = true;

      if (isRSIBlockedForCurrentRecommendation) {
        if (rsiCurrentValue < clampedOversoldThreshold) {
          statusLabel = `Blocking: Oversold, reversal pending | RSI ${rsiValueText}`;
        } else if (rsiCurrentValue > clampedOverboughtThreshold) {
          statusLabel = `Blocking: Overbought, reversal pending | RSI ${rsiValueText}`;
        } else {
          statusLabel = `Blocking: Wait for Reversal trend | RSI ${rsiValueText}`;
        }
        passesStatus = false;
      } else if (buyReversalDetected || sellReversalDetected) {
        statusLabel = `Reversal detected | RSI ${rsiValueText}`;
      } else if (rsiCurrentValue < clampedOversoldThreshold) {
        statusLabel = `Non-blocking: Oversold | RSI ${rsiValueText}`;
      } else if (rsiCurrentValue > clampedOverboughtThreshold) {
        statusLabel = `Non-blocking: Overbought | RSI ${rsiValueText}`;
      }

      factors.push({
        label: "Technical Analysis: RSI Gate",
        detail: statusLabel,
        passes: passesStatus,
      });
    }
  }

  return factors;
}

export function scoreBreakdownRows(stock: IosStockInput): {
  analystLine: string;
  analystPoints: string;
  capLine: string;
  capPoints: string;
  qualityPoints: string;
  qualityMetrics: Array<{ label: string; value: string; points: string }>;
} {
  const qualityItems: Array<{ label: string; value: string; normalized: number }> = [];
  const peg = stock.peg ?? 0;
  if (!stock.isETF && peg > 0) {
    qualityItems.push({ label: "PEG", value: peg.toFixed(2), normalized: pegNormalized(peg) });
  }
  if (!stock.isETF && stock.returnOnEquity != null && Number.isFinite(stock.returnOnEquity)) {
    qualityItems.push({
      label: "ROE",
      value: `${(stock.returnOnEquity * 100).toFixed(1)}%`,
      normalized: roeNormalized(stock.returnOnEquity),
    });
  }
  if (!stock.isETF && stock.profitMargin != null && Number.isFinite(stock.profitMargin)) {
    qualityItems.push({
      label: "Profit Margin",
      value: `${(stock.profitMargin * 100).toFixed(1)}%`,
      normalized: marginNormalized(stock.profitMargin),
    });
  }
  if (!stock.isETF && stock.debtToEquity != null && Number.isFinite(stock.debtToEquity) && stock.debtToEquity >= 0) {
    const ratio = stock.debtToEquity > 1 ? stock.debtToEquity / 100 : stock.debtToEquity;
    qualityItems.push({
      label: "Debt/Equity",
      value: `${(ratio * 100).toFixed(1)}%`,
      normalized: debtToEquityNormalized(stock.debtToEquity),
    });
  }

  const hasQualityBucket = qualityItems.length > 0;
  const analystWeight = hasQualityBucket ? 40 : 60;
  const marketCapWeight = hasQualityBucket ? 20 : 40;
  const qualityWeight = hasQualityBucket ? 40 : 0;

  let analystPoints = 0;
  const aa = stock.analystAvg?.trim();
  if (aa) {
    const ar = parseFloat(aa);
    if (Number.isFinite(ar)) analystPoints = (ar / 5) * analystWeight;
  }

  let capScore = 0;
  const mc = stock.marketCap;
  if (mc != null && mc > 0) {
    if (mc >= 200_000_000_000) capScore = marketCapWeight;
    else if (mc >= 50_000_000_000) capScore = marketCapWeight * 0.75;
    else if (mc >= 10_000_000_000) capScore = marketCapWeight * 0.5;
    else if (mc >= 1_000_000_000) capScore = marketCapWeight * 0.25;
  }

  const qualityPoints =
    qualityWeight > 0 && qualityItems.length > 0
      ? (qualityItems.reduce((sum, item) => sum + item.normalized, 0) / qualityItems.length) * qualityWeight
      : 0;

  const perMetricWeight = qualityItems.length > 0 ? qualityWeight / qualityItems.length : 0;
  const qualityMetrics = qualityItems.map((item) => ({
    label: item.label,
    value: item.value,
    points: `${(item.normalized * perMetricWeight).toFixed(1)}/${perMetricWeight.toFixed(1)}`,
  }));

  return {
    analystLine: aa ? `${aa}/5.0` : "—",
    analystPoints: `${analystPoints.toFixed(1)}/${analystWeight}`,
    capLine: mc != null && mc > 0 ? `$${(mc / 1_000_000_000).toFixed(2)}B` : "—",
    capPoints: `${capScore.toFixed(1)}/${marketCapWeight}`,
    qualityPoints: `${qualityPoints.toFixed(1)}/${qualityWeight || 40}`,
    qualityMetrics,
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
    rsiPeriod = 14,
    rsiOversoldThreshold = 30,
    rsiOverboughtThreshold = 70,
    rsiHysteresisPoints = 5,
    rsiMinRisingDays = 2,
    sellOnlyLongTermQualified = false,
    useTraderMode = false,
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
  const canComputePreferredSMA = closes.length >= shortSMAPeriod;

  if (canComputePreferredSMA) {
    movingAvg = sma(closes, shortSMAPeriod);
    actualSmaPeriod = shortSMAPeriod;
  } else if (pre != null && pre > 0) {
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
    actualSmaPeriod = Math.max(25, closes.length);
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

  const nextBuyPrice = numStock === 0 || avgPrice <= 0 ? movingAvg : movingAvg * buyFactorSMA;

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
    unrealizedGain
  );

  const metricScore = stock.score ?? 0;
  const washSaleInfo = skipWashSaleCheck ? null : getWashSaleInfo(stock);
  const shouldApplyAISentimentGate = useAISentiment && !relaxScoreRequirement && stock.isETF !== true;
  const rsiGateEnabled = useRSIGating;
  const clampedRsiPeriod = Math.max(2, Math.min(30, rsiPeriod));
  const clampedOversoldThreshold = Math.max(10, Math.min(50, rsiOversoldThreshold));
  const clampedOverboughtThreshold = Math.max(50, Math.min(90, rsiOverboughtThreshold));
  const clampedHysteresisPoints = Math.max(0, Math.min(20, rsiHysteresisPoints));
  const clampedRsiMinRisingDays = Math.max(1, Math.min(5, rsiMinRisingDays));
  const maxAccumulationLimit = 2 * stockLimit;
  const enforceRSIGateForThisEntry = rsiGateEnabled && numStock > 0 && costBasis > stockLimit;

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
    const oldest = getOldestTaxableGainLotDate(stock, currentPrice);
    if (oldest != null && !isUnknownPurchaseDate(oldest)) {
      passesLongTermCheckForSell = Date.now() - oldest.getTime() > 365 * DAY_MS;
    }
  }
  const passesLongTermReduceGate = passesLongTermCheckForReduce(
    stock,
    currentPrice,
    reduceQty,
    sellOnlyLongTermQualified
  );

  // Guard: for non-ETF stocks, leftover-upside SELLs require a real analyst target.
  const hasDefinitiveTarget = (stock.analystTarget != null && stock.analystTarget > 0) || stock.isETF === true;

  // Trader mode only: live RSI is overbought and leftover upside is under 10% → full SELL.
  // Investor mode holds to analyst target. This uses the same overbought reading shown on
  // the RSI Gate factor, not the hysteresis reversal used for REDUCE.
  if (useTraderMode && rsiGateEnabled && numStock > 0 && passesLongTermCheckForSell && hasDefinitiveTarget) {
    const currentRSI = rsiSeries(closes, clampedRsiPeriod).at(-1) ?? 0;
    if (currentRSI > clampedOverboughtThreshold && expectedReturnPct < 10) {
      return {
        action: "SELL",
        comments: `Trader mode: RSI is overbought (${currentRSI.toFixed(0)}/100) with only ${expectedReturnPct.toFixed(1)}% leftover upside — SELL to offload the full position.`,
        nextBuyPrice,
        movingAvg,
        expectedReturnPct,
      };
    }
  }

  if (numStock > 0 && rsiGateEnabled && currentPrice > avgPrice && passesLongTermReduceGate) {
    const passesRsiSell = passesRSISellSignalWithHysteresis(
      closes,
      clampedRsiPeriod,
      clampedOverboughtThreshold,
      clampedHysteresisPoints,
      clampedRsiMinRisingDays
    );
    if (passesRsiSell && reduceQty > 0) {
      const currentRSI = rsiSeries(closes, clampedRsiPeriod).at(-1) ?? 50;
      return {
        action: "REDUCE",
        comments: `RSI overbought reversal (RSI: ${currentRSI.toFixed(0)}/100) — trim ${reduceQty.toFixed(0)} shares to lock in partial gains while keeping position for continued upside.`,
        nextBuyPrice,
        movingAvg,
        expectedReturnPct,
      };
    }
  }

  // Profit-protection exit (Trader mode only): lock gains during multi-signal weakness before analyst target is reached.
  // Guardrail: only trigger when current price is still above SMA.
  // Investor mode: skip this block entirely — hold until analyst target.
  if (useTraderMode && numStock > 0 && avgPrice > 0 && currentPrice > movingAvg && passesLongTermCheckForSell) {
    const unrealizedGainPct = ((currentPrice - avgPrice) / Math.max(avgPrice, 0.0001)) * 100;
    if (unrealizedGainPct >= 25) {
      const scoreWeakness = metricScore > 0 && metricScore < 50;

      const rsiValues = rsiSeries(closes, clampedRsiPeriod);
      const rsiWeakness = rsiValues.length >= 3
        && (rsiValues.at(-1) ?? 100) < 55
        && (rsiValues.at(-1) ?? 100) < (rsiValues.at(-2) ?? 100)
        && (rsiValues.at(-2) ?? 100) < (rsiValues.at(-3) ?? 100);

      let aiWeakness = false;
      if (shouldApplyAISentimentGate) {
        const ai = stock.aiSentimentScore;
        const lastUpdated = stock.aiSentimentLastUpdated ? new Date(stock.aiSentimentLastUpdated) : null;
        const isFresh = lastUpdated && (Date.now() - lastUpdated.getTime()) < (3 * 24 * 60 * 60 * 1000);
        aiWeakness = ai != null && ai < 45 && Boolean(isFresh);
      }

      const weaknessCount = [scoreWeakness, rsiWeakness, aiWeakness].filter(Boolean).length;
      if (weaknessCount >= 3 && expectedReturnPct < 15) {
        return {
          action: "SELL",
          comments: `Profit protection: Unrealized gain is ${unrealizedGainPct.toFixed(1)}% with broad weakness (score/RSI/AI). Price remains above SMA, but momentum is deteriorating — SELL to lock in gains.`,
          nextBuyPrice,
          movingAvg,
          expectedReturnPct,
        };
      }
    }
  }

  // Guard: for non-ETF stocks, only trigger SELL when a real analyst target exists.
  // The fallback profit-% target drives expectedReturnPct display only, not a SELL signal,
  // to prevent false SELL flashes when analystTarget is temporarily missing during a refresh.
  if (numStock > 0 && targetPrice != null && currentPrice >= targetPrice && passesLongTermCheckForSell && hasDefinitiveTarget && expectedReturnPct < 15) {
    // RSI gate: if overbought right now, defer SELL until RSI reverses
    if (rsiGateEnabled) {
      const currentRSI = rsiSeries(closes, clampedRsiPeriod).at(-1) ?? 0;
      if (currentRSI > clampedOverboughtThreshold) {
        return {
          action: "WAIT_ADD" as const,
          comments: `Target reached but RSI is overbought (${currentRSI.toFixed(0)}/100) — holding for RSI reversal confirmation before selling to avoid selling at momentum peak.`,
          nextBuyPrice,
          movingAvg,
          expectedReturnPct,
        };
      }
    }
    // AI Sentiment bullish gate — if sentiment is bullish (≥65) for a non-ETF, hold off selling;
    // recent positive news suggests potential upside beyond the current analyst target.
    // Only apply if sentiment is fresh (updated within last 3 days)
    if (shouldApplyAISentimentGate) {
      const ai = stock.aiSentimentScore;
      const lastUpdated = stock.aiSentimentLastUpdated ? new Date(stock.aiSentimentLastUpdated) : null;
      const isFresh = lastUpdated && (Date.now() - lastUpdated.getTime()) < (3 * 24 * 60 * 60 * 1000);
      
      if (ai != null && ai >= 65 && isFresh) {
        const label = ai >= 70 ? "Bullish" : "Mildly Bullish";
        return {
          action: "WAIT_ADD" as const,
          comments: `AI Sentiment is ${label} (${ai.toFixed(0)}/100) — holding position as recent news suggests potential upside beyond analyst target.`,
          nextBuyPrice,
          movingAvg,
          expectedReturnPct,
        };
      }
    }
    return {
      action: "SELL",
      comments: generateSellComment(stock, targetPrice),
      nextBuyPrice,
      movingAvg,
      expectedReturnPct,
    };
  }

  const gateReturnAndScore =
    relaxScoreRequirement || stock.isETF === true || (expectedReturnPct > 25 && (metricScore === 0 || metricScore > 50));

  if (
    currentPrice <= nextBuyPrice &&
    costBasis < maxAccumulationLimit &&
    currentPrice < transactionLimit &&
    gateReturnAndScore
  ) {
    if (enforceRSIGateForThisEntry) {
      const passesRSIGate = passesRSIReversalWithHysteresis(
        closes,
        clampedRsiPeriod,
        clampedOversoldThreshold,
        clampedHysteresisPoints,
        clampedRsiMinRisingDays
      );
      if (!passesRSIGate) {
        return {
          action: "WAIT_ADD",
          comments:
            "RSI reversal gate active: wait for oversold momentum to reverse with hysteresis confirmation before buying.",
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
      const lastUpdated = stock.aiSentimentLastUpdated ? new Date(stock.aiSentimentLastUpdated) : null;
      const isFresh = lastUpdated && (Date.now() - lastUpdated.getTime()) < (3 * 24 * 60 * 60 * 1000);
      
      if (ai != null && ai > 0 && ai < 50 && isFresh) {
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
          comments: `Buy ${suggestedShares.toFixed(0)} stocks. Current price is below ${actualSmaPeriod.toFixed(0)} day moving avg ${formatCurrency(movingAvg)}`,
        nextBuyPrice,
        movingAvg,
        expectedReturnPct,
      };
    }

    if (metricScore > 0 && metricScore < 50) {
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
      comments: `Add ${addQty.toFixed(0)} stocks. Current price is below next target buy price ${formatCurrency(nextBuyPrice)}`,
      nextBuyPrice,
      movingAvg,
      expectedReturnPct,
    };
  }

  if (numStock > 0 && costBasis > stockLimit && reduceQty > 0 && passesLongTermReduceGate) {
    return {
      action: "REDUCE",
      comments: generateReduceComment(stock, reduceQty, sellOnlyLongTermQualified),
      nextBuyPrice,
      movingAvg,
      expectedReturnPct,
    };
  }

  if (numStock === 0) {
    const blockers: string[] = [];
    if (currentPrice > nextBuyPrice) {
      blockers.push(`price is above ${actualSmaPeriod.toFixed(0)}-day moving average (${formatCurrency(movingAvg)})`);
    }
    if (stock.isETF !== true && !relaxScoreRequirement) {
      if (expectedReturnPct <= 25) {
        blockers.push(`expected return ${expectedReturnPct.toFixed(2)}% is at/below 25% minimum`);
      }
      if (metricScore > 0 && metricScore <= 50) {
        blockers.push(`score ${metricScore.toFixed(0)}/100 is at/below 50 minimum`);
      }
    }
    if (currentPrice >= transactionLimit) {
      blockers.push(`share price exceeds per-trade limit (${formatCurrency(transactionLimit)})`);
    }
    return {
      action: "WAIT_BUY",
      comments:
        blockers.length === 0
          ? `Waiting for entry conditions to align. Next buy trigger: ${formatCurrency(nextBuyPrice)}.`
          : `WAIT due to: ${blockers.join("; ")}.`,
      nextBuyPrice,
      movingAvg,
      expectedReturnPct,
    };
  }

  if (costBasis >= maxAccumulationLimit) {
    return {
      action: "WAIT_REDUCE",
      comments: "Position at 2× Stock Limit cap — no more adding. Reduce triggers when unrealized gains exceed the over-limit exposure.",
      nextBuyPrice,
      movingAvg,
      expectedReturnPct,
    };
  }

  if (costBasis > stockLimit) {
    const blockers: string[] = [];
    if (reduceQty <= 0) {
      blockers.push("unrealized gain is not yet sufficient for a trim");
    }
    if (!passesLongTermReduceGate) {
      blockers.push("long-term tax holding-period rule not yet met");
    }

    return {
      action: "WAIT_REDUCE",
      comments:
        blockers.length === 0
          ? "Position is above stock limit; monitoring for REDUCE trigger now. ADD can still trigger on deeper pullbacks while position remains below 2× stock limit."
          : `Position is above stock limit. Waiting to REDUCE when triggers align: ${blockers.join("; ")}. ADD can still trigger on deeper pullbacks while below 2× stock limit.`,
      nextBuyPrice,
      movingAvg,
      expectedReturnPct,
    };
  }

  const addBlockers: string[] = [];
  if (currentPrice > nextBuyPrice) {
    addBlockers.push(`price ${formatCurrency(currentPrice)} is above next buy target ${formatCurrency(nextBuyPrice)}`);
  }
  if (stock.isETF !== true && !relaxScoreRequirement) {
    if (expectedReturnPct <= 25) {
      addBlockers.push(`leftover upside ${expectedReturnPct.toFixed(1)}% is at/below 25% minimum`);
    }
    if (metricScore > 0 && metricScore <= 50) {
      addBlockers.push(`score ${metricScore.toFixed(0)}/100 is at/below 50 minimum`);
    }
  }
  if (currentPrice >= transactionLimit) {
    addBlockers.push(`share price exceeds per-trade limit (${formatCurrency(transactionLimit)})`);
  }

  return {
    action: "WAIT_ADD",
    comments:
      addBlockers.length === 0
        ? `Waiting for add conditions to align. Next buy trigger: ${formatCurrency(nextBuyPrice)}.`
        : `WAIT to ADD due to: ${addBlockers.join("; ")}.`,
    nextBuyPrice,
    movingAvg,
    expectedReturnPct,
  };
}
