import type { SupabaseClient } from "@supabase/supabase-js";
import { getCachedHistoricalPricePoints, setCachedHistoricalPricePoints } from "@/lib/historical-price-cache";
import type { PricePoint } from "@/lib/stock-chart";

type HistoryRow = {
  date: string;
  close: number | null;
  adjusted_close?: number | null;
};

const MAX_DAYS = 2000;
const MASTER_CACHE_DAYS = MAX_DAYS;
const CANONICAL_SPLIT_RATIOS = [1.25, 4 / 3, 1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const SPLIT_RATIO_MATCH_TOLERANCE = 0.08;

function nearestCanonicalSplitRatio(observed: number): number | null {
  if (!Number.isFinite(observed) || observed <= 1.2) return null;

  let best: number | null = null;
  let bestError = Number.POSITIVE_INFINITY;
  for (const ratio of CANONICAL_SPLIT_RATIOS) {
    const relError = Math.abs(observed - ratio) / ratio;
    if (relError < bestError) {
      bestError = relError;
      best = ratio;
    }
  }

  return best != null && bestError <= SPLIT_RATIO_MATCH_TOLERANCE ? best : null;
}

/** Scale to apply to `older` so it matches the newer price regime after a split. */
function splitScaleForOlder(older: number, newer: number): number | null {
  if (!(older > 0) || !(newer > 0)) return null;
  const forward = nearestCanonicalSplitRatio(older / newer);
  if (forward) return 1 / forward;
  const reverse = nearestCanonicalSplitRatio(newer / older);
  if (reverse) return reverse;
  return null;
}

function normalizeSplitContinuity(pointsAsc: PricePoint[]): PricePoint[] {
  if (pointsAsc.length < 3) return pointsAsc;

  const normalized = pointsAsc.map((point) => ({ ...point }));
  let cumulativeScale = 1;

  for (let i = pointsAsc.length - 2; i >= 0; i -= 1) {
    const older = Number(pointsAsc[i]?.close);
    const newer = Number(pointsAsc[i + 1]?.close);
    if (!Number.isFinite(older) || !Number.isFinite(newer) || older <= 0 || newer <= 0) {
      continue;
    }

    const scale = splitScaleForOlder(older, newer);
    if (scale != null) {
      cumulativeScale *= scale;
    }

    normalized[i] = {
      ...normalized[i],
      close: older * cumulativeScale,
    };
  }

  return normalized.filter((p) => Number.isFinite(p.close) && p.close > 0);
}

function cachedSeriesNeedsFullReload(cached: PricePoint[], incoming: PricePoint[]): boolean {
  if (cached.length === 0 || incoming.length === 0) return false;

  const byDate = new Map(cached.map((point) => [point.date.slice(0, 10), point.close]));
  for (const point of incoming) {
    const previous = byDate.get(point.date.slice(0, 10));
    if (previous != null && splitScaleForOlder(previous, point.close) != null) {
      return true;
    }
  }

  const lastCached = cached[cached.length - 1];
  if (!lastCached) return false;
  const firstNewer = incoming
    .filter((point) => point.date.slice(0, 10) > lastCached.date.slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return firstNewer != null && splitScaleForOlder(lastCached.close, firstNewer.close) != null;
}

function rowDate(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value != null) return String(value).slice(0, 10);
  return "";
}

function inferSplitRatio(
  rows: { rawClose: number; adjustedClose: number | null }[],
  currentIndex: number
): number | null {
  const offsets = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  for (const offset of offsets) {
    for (const index of [currentIndex - offset, currentIndex + offset]) {
      if (index < 0 || index >= rows.length) continue;
      const neighbor = rows[index];
      if (!neighbor || neighbor.adjustedClose == null || neighbor.rawClose <= 0) continue;
      const ratio = neighbor.rawClose / neighbor.adjustedClose;
      const rounded = Math.round(ratio);
      if (ratio > 1.2 && Math.abs(rounded - ratio) <= 0.1) return rounded;
    }
  }
  return null;
}

/**
 * Prefer split-adjusted closes the same way iOS ChartDataService does.
 * `closeIsRaw` is true for REST `historical_prices.close`; false when the RPC already
 * COALESCE'd adjusted_close into `close`.
 */
function pointsFromHistoryRows(rows: HistoryRow[], closeIsRaw: boolean): PricePoint[] {
  const rowTuples = rows.map((row) => {
    const rawClose = row.close != null ? Number(row.close) : NaN;
    const adjusted = row.adjusted_close != null ? Number(row.adjusted_close) : NaN;
    return {
      date: rowDate(row.date),
      rawClose: Number.isFinite(rawClose) && rawClose > 0 ? rawClose : NaN,
      adjustedClose: Number.isFinite(adjusted) && adjusted > 0 ? adjusted : null,
    };
  });

  const resolved = rowTuples.map((row, index) => {
    if (row.adjustedClose != null) {
      return { date: row.date, close: row.adjustedClose };
    }
    if (!Number.isFinite(row.rawClose) || row.rawClose <= 0) {
      return { date: row.date, close: NaN };
    }
    if (closeIsRaw) {
      const ratio = inferSplitRatio(rowTuples, index);
      if (ratio != null && ratio > 1) {
        return { date: row.date, close: row.rawClose / ratio };
      }
    }
    return { date: row.date, close: row.rawClose };
  });

  const sortedResolved = resolved
    .filter((p) => p.date.length >= 10 && Number.isFinite(p.close) && p.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const hasTrueAdjustedClose = rowTuples.some((row) => {
    if (row.adjustedClose == null || !(row.rawClose > 0)) return false;
    if (!closeIsRaw) return true;
    return Math.abs(row.adjustedClose - row.rawClose) / row.rawClose > 0.005;
  });

  // Already-adjusted series must not be stitched again (a 50% crash looks like a 2:1 split).
  return hasTrueAdjustedClose ? sortedResolved : normalizeSplitContinuity(sortedResolved);
}

async function loadHistoryRows(
  supabase: SupabaseClient,
  symbol: string,
  daysToLoad: number
): Promise<{ rows: HistoryRow[]; closeIsRaw: boolean; error: string | null }> {
  const rest = await supabase
    .from("historical_prices")
    .select("date, close, adjusted_close")
    .eq("symbol", symbol)
    .order("date", { ascending: false })
    .limit(daysToLoad);

  if (!rest.error) {
    return { rows: (rest.data ?? []) as HistoryRow[], closeIsRaw: true, error: null };
  }

  const rpc = await supabase.rpc("get_historical_prices", {
    p_symbol: symbol,
    p_days: daysToLoad,
  });
  if (rpc.error) {
    return { rows: [], closeIsRaw: false, error: rpc.error.message };
  }
  return { rows: (rpc.data ?? []) as HistoryRow[], closeIsRaw: false, error: null };
}

/**
 * Loads daily closes from `historical_prices`, preferring `adjusted_close` like iOS
 * `ChartDataService` (REST). Falls back to `get_historical_prices` if the table read fails.
 * Returns points sorted ascending by calendar date (oldest first) for charting and SMA.
 */
export async function fetchHistoricalPricePoints(
  supabase: SupabaseClient,
  symbol: string,
  days = 400
): Promise<{ points: PricePoint[]; error: string | null }> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return { points: [], error: "Missing symbol" };

  const n = Math.min(Math.max(Math.floor(days), 1), MAX_DAYS);
  const cached = getCachedHistoricalPricePoints(sym, n);
  if (cached?.isFresh) {
    return { points: cached.points, error: null };
  }

  // A saved series is reused. Only the latest sessions are fetched and appended.
  // The full horizon is downloaded when this symbol has no local history yet.
  const savedSeries = getCachedHistoricalPricePoints(sym, 1);
  const requestDays = savedSeries && savedSeries.points.length >= 60 ? 10 : MASTER_CACHE_DAYS;

  const loaded = await loadHistoryRows(supabase, sym, requestDays);
  if (loaded.error) {
    if (cached) {
      return { points: cached.points, error: null };
    }
    return { points: [], error: loaded.error };
  }

  let points = pointsFromHistoryRows(loaded.rows, loaded.closeIsRaw);
  const incremental = requestDays < MASTER_CACHE_DAYS;
  const savedPoints = savedSeries?.points ?? [];

  if (incremental && cachedSeriesNeedsFullReload(savedPoints, points)) {
    const full = await loadHistoryRows(supabase, sym, MASTER_CACHE_DAYS);
    if (!full.error) {
      points = pointsFromHistoryRows(full.rows, full.closeIsRaw);
      setCachedHistoricalPricePoints(sym, points, { replace: true });
      return { points, error: null };
    }
  }

  setCachedHistoricalPricePoints(sym, points, { replace: !incremental });
  const merged = getCachedHistoricalPricePoints(sym, 1);
  return { points: merged?.points ?? points, error: null };
}
