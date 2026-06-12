import {
  computeIosRecommendation,
  type IosRecOptions,
  type IosStockInput,
} from "@/lib/ios-recommendation";

export type RecInput = IosStockInput;
export type RecOut = ReturnType<typeof computeIosRecommendation>;

export type BuildRecommendationOptions = Pick<IosRecOptions, "closes"> & {
  etfProfitTarget?: number;
  stockProfitTarget?: number;
  useAISentiment?: boolean;
  useRSIGating?: boolean;
  rsiPeriod?: number;
  rsiOversoldThreshold?: number;
  rsiOverboughtThreshold?: number;
  rsiHysteresisPoints?: number;
  rsiMinRisingDays?: number;
  sellOnlyLongTermQualified?: boolean;
  openLots?: IosStockInput["openLots"];
  soldLots?: IosStockInput["soldLots"];
};

/**
 * Builds recommendation using the same rules as iOS `RecommendationEngine.compute`.
 * Caller should set `stock.score` via `computeRiskReturnScore` (except ETFs) before calling.
 */
export function buildRecommendation(stock: RecInput, options?: BuildRecommendationOptions): RecOut {
  return computeIosRecommendation(
    {
      ...stock,
      openLots: options?.openLots,
      soldLots: options?.soldLots,
    },
    {
      closes: options?.closes,
      etfProfitTargetPercent: options?.etfProfitTarget ?? 50,
      stockProfitTargetPercent: options?.stockProfitTarget ?? 50,
      skipWashSaleCheck: false,
      relaxScoreRequirement: false,
      useAISentiment: options?.useAISentiment ?? true,
      useRSIGating: options?.useRSIGating ?? true,
      rsiPeriod: options?.rsiPeriod,
      rsiOversoldThreshold: options?.rsiOversoldThreshold,
      rsiOverboughtThreshold: options?.rsiOverboughtThreshold,
      rsiHysteresisPoints: options?.rsiHysteresisPoints,
      rsiMinRisingDays: options?.rsiMinRisingDays,
      sellOnlyLongTermQualified: options?.sellOnlyLongTermQualified ?? false,
    }
  );
}

/** Actionable signals (excludes WAIT_*). */
export function isBuyOrSellAction(action: string | undefined): boolean {
  const a = (action ?? "").trim().toUpperCase();
  return a === "BUY" || a === "SELL" || a === "ADD" || a === "REDUCE";
}

/** iOS `Recommendation.Action.displayText`: WAIT_* → "WAIT". */
export function recommendationActionDisplay(action: string): string {
  const u = action.toUpperCase();
  if (u === "WAIT_BUY" || u === "WAIT_ADD" || u === "WAIT_REDUCE") return "WAIT";
  return u;
}
