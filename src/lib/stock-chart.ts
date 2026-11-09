export type PricePoint = { date: string; close: number };

export const CHART_RANGES = ["1w", "1mo", "3mo", "6mo", "1y", "5y"] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

const MS_DAY = 86400000;

function etCalendarDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

/** Parse YYYY-MM-DD to UTC noon ms for chart x-axis / range math. */
export function parseYmdToUtcNoon(date: string): number {
  const d = date.trim().slice(0, 10);
  const p = d.split("-").map((x) => parseInt(x, 10));
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return NaN;
  return Date.UTC(p[0], p[1] - 1, p[2], 12, 0, 0);
}

export function appendOrReplaceIntradayPricePoint(
  points: PricePoint[],
  livePrice: number,
  now = new Date()
): PricePoint[] {
  if (!Number.isFinite(livePrice) || livePrice <= 0 || points.length === 0) return points;

  const todayEt = etCalendarDateString(now);
  const next = [...points];
  const idx = next.findIndex((point) => point.date.slice(0, 10) === todayEt);
  if (idx >= 0) {
    const current = next[idx]!;
    if (Math.abs(current.close - livePrice) <= 0.001) return points;
    next[idx] = { ...current, date: todayEt, close: livePrice };
    return next;
  }
  const lastClose = next.at(-1)?.close ?? 0;
  if (Math.abs(lastClose - livePrice) <= 0.001) return points;
  return [...next, { date: todayEt, close: livePrice }];
}

/**
 * Keep **every** daily close in the window (calendar-day cut from last bar date).
 * Avoids the old “only 5 points for 1W” behavior so tooltips track fine-grained moves.
 */
export function sliceForRange(points: PricePoint[], range: ChartRange): PricePoint[] {
  const n = points.length;
  if (n === 0) return [];
  if (range === "5y") return points;

  const lastMs = parseYmdToUtcNoon(points[n - 1]!.date);
  if (!Number.isFinite(lastMs)) return points;

  const calendarSpanDays =
    range === "1w"
      ? 12
      : range === "1mo"
        ? 35
      : range === "3mo"
        ? 100
        : range === "6mo"
          ? 195
          : range === "1y"
            ? 380
            : 380;

  const cutMs = lastMs - calendarSpanDays * MS_DAY;
  return points.filter((p) => {
    const t = parseYmdToUtcNoon(p.date);
    return Number.isFinite(t) && t >= cutMs;
  });
}

export function rangePercentChange(points: PricePoint[]): number | null {
  if (points.length < 2) return null;
  const a = points[0]!.close;
  const b = points[points.length - 1]!.close;
  if (!a) return null;
  return ((b - a) / a) * 100;
}

/** Simple SMA over closing prices (last `period` points of the given series). */
export function lastSma(points: PricePoint[], period: number): number | null {
  if (period < 1 || points.length < period) return null;
  const slice = points.slice(-period);
  return slice.reduce((acc, p) => acc + p.close, 0) / period;
}
