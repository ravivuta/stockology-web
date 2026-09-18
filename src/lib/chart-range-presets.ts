export type ChartRangePreset = "1w" | "1m" | "3m" | "6m" | "1y" | "max";

const MS_DAY = 86400000;

export const CHART_RANGE_ORDER: ChartRangePreset[] = ["1w", "1m", "3m", "6m", "1y"];

export const HOME_COMPARE_DURATION_ORDER: ChartRangePreset[] = ["3m", "1y", "max"];

export const CHART_RANGE_MS: Record<ChartRangePreset, number> = {
  "1w": 7 * MS_DAY,
  "1m": 30 * MS_DAY,
  "3m": 90 * MS_DAY,
  "6m": 180 * MS_DAY,
  "1y": 365 * MS_DAY,
  max: Number.POSITIVE_INFINITY,
};

export const CHART_RANGE_LABEL: Record<ChartRangePreset, string> = {
  "1w": "1W",
  "1m": "1M",
  "3m": "3M",
  "6m": "6M",
  "1y": "1Y",
  max: "Max",
};

export function filterDataByRange<T extends { t: number }>(
  chartData: T[],
  range: ChartRangePreset
): { filtered: T[]; usedFullHistoryFallback: boolean } {
  if (chartData.length === 0) {
    return { filtered: [], usedFullHistoryFallback: false };
  }
  if (range === "max") {
    return { filtered: chartData, usedFullHistoryFallback: false };
  }
  const cutoff = Date.now() - CHART_RANGE_MS[range];
  const sliced = chartData.filter((d) => d.t >= cutoff);
  if (sliced.length >= 2) return { filtered: sliced, usedFullHistoryFallback: false };
  if (sliced.length === 1) return { filtered: sliced, usedFullHistoryFallback: false };
  return {
    filtered: chartData,
    usedFullHistoryFallback: chartData.length >= 2,
  };
}
