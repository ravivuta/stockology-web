import type { NetWorthPoint } from "@/lib/portfolio-net-worth-series";

export type SpyDaily = { date: string; close: number };

function etYmdFromMs(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(ms));
}

function spySorted(spy: SpyDaily[]): SpyDaily[] {
  return [...spy].sort((a, b) => a.date.localeCompare(b.date));
}

/** Last trading day close with date <= ymd (YYYY-MM-DD). */
export function spyCloseOnOrBefore(sortedAsc: SpyDaily[], ymd: string): number | null {
  let lo = 0;
  let hi = sortedAsc.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid].date <= ymd) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (ans < 0) return null;
  return sortedAsc[ans].close;
}

export type ComparisonBaseRow = { dateMs: number; portfolioValue: number; spyClose: number };

export function mergePortfolioWithSpy(
  portfolioPoints: NetWorthPoint[],
  spySeries: SpyDaily[]
): ComparisonBaseRow[] {
  const sorted = spySorted(spySeries);
  if (sorted.length === 0) return [];
  const out: ComparisonBaseRow[] = [];
  for (const pp of portfolioPoints) {
    const ymd = etYmdFromMs(pp.t);
    const spyC = spyCloseOnOrBefore(sorted, ymd);
    if (spyC == null || !Number.isFinite(spyC)) continue;
    out.push({ dateMs: pp.t, portfolioValue: pp.value, spyClose: spyC });
  }
  return out;
}

function ymdToUtcNoonMs(ymd: string): number {
  const d = ymd.trim().slice(0, 10);
  const p = d.split("-").map((x) => parseInt(x, 10));
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return 0;
  return Date.UTC(p[0], p[1] - 1, p[2], 12, 0, 0);
}

/**
 * One row per **SPY trading day** in `[rangeMinMs, rangeMaxMs]` (ET calendar bounds from the
 * selected range). Portfolio value is forward-filled from the latest snapshot on or before
 * each day — no extra API calls; uses the already-fetched SPY series.
 */
export function mergePortfolioWithSpyDaily(
  allPortfolioPoints: NetWorthPoint[],
  spySeries: SpyDaily[],
  rangeMinMs: number,
  rangeMaxMs: number
): ComparisonBaseRow[] {
  const sortedSpy = spySorted(spySeries);
  if (sortedSpy.length === 0 || allPortfolioPoints.length === 0) return [];

  const sortedPort = [...allPortfolioPoints].sort((a, b) => a.t - b.t);
  const minY = etYmdFromMs(rangeMinMs);
  const maxY = etYmdFromMs(rangeMaxMs);

  let pi = 0;
  const out: ComparisonBaseRow[] = [];

  for (const s of sortedSpy) {
    if (s.date < minY || s.date > maxY) continue;
    if (!Number.isFinite(s.close)) continue;

    while (pi + 1 < sortedPort.length && etYmdFromMs(sortedPort[pi + 1].t) <= s.date) {
      pi++;
    }

    if (etYmdFromMs(sortedPort[pi].t) > s.date) continue;

    const dateMs = ymdToUtcNoonMs(s.date);
    if (dateMs <= 0) continue;

    out.push({
      dateMs,
      portfolioValue: sortedPort[pi].value,
      spyClose: s.close,
    });
  }

  return out;
}

export type ComparisonChartRow = {
  dateMs: number;
  portfolioPct: number;
  spyPct: number;
  value: number;
};

/** Cumulative % from the first point in the (already range-filtered) series. */
export function toCumulativePercentRows(rows: ComparisonBaseRow[]): ComparisonChartRow[] {
  if (rows.length === 0) return [];
  const v0 = rows[0].portfolioValue;
  const s0 = rows[0].spyClose;
  return rows.map((r) => ({
    dateMs: r.dateMs,
    value: r.portfolioValue,
    portfolioPct: v0 > 0 && Number.isFinite(v0) ? 100 * (r.portfolioValue / v0 - 1) : 0,
    spyPct: s0 > 0 && Number.isFinite(s0) ? 100 * (r.spyClose / s0 - 1) : 0,
  }));
}
