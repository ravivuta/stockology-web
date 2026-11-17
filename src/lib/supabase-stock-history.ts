import type { SupabaseClient } from "@supabase/supabase-js";
import { getCachedHistoricalPricePoints, setCachedHistoricalPricePoints } from "@/lib/historical-price-cache";
import type { PricePoint } from "@/lib/stock-chart";

type HistoryRow = {
  date: unknown;
  close: number | null;
  adjusted_close?: number | null;
};

const MAX_DAYS = 2000;
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

/** Match iOS ChartDataService / SupabaseHistoricalService date parsing. */
function rowDate(value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = typeof value === "string" ? value.trim() : value != null ? String(value).trim() : "";
  const matched = raw.match(/(\d{4}-\d{2}-\d{2})/);
  return matched?.[1] ?? "";
}

function fromDateIso(days: number): string {
  const calendarDaysBack = Math.max(1, Math.ceil(days * 1.5));
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - calendarDaysBack);
  return from.toISOString().slice(0, 10);
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
 * Same rules as iOS `resolvedHistoricalCloses`: prefer `adjusted_close`, infer a split
 * ratio from neighbors when adj is missing, and only stitch crash-like jumps when the
 * series has no real adj vs raw evidence.
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
    .filter((p) => p.date.length === 10 && Number.isFinite(p.close) && p.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const hasTrueAdjustedClose = rowTuples.some((row) => {
    if (row.adjustedClose == null || !(row.rawClose > 0)) return false;
    if (!closeIsRaw) return true;
    return Math.abs(row.adjustedClose - row.rawClose) / row.rawClose > 0.005;
  });

  return hasTrueAdjustedClose ? sortedResolved : normalizeSplitContinuity(sortedResolved);
}

async function loadFromRest(
  supabase: SupabaseClient,
  symbol: string,
  daysToLoad: number
): Promise<{ rows: HistoryRow[]; error: string | null }> {
  const fromStr = fromDateIso(daysToLoad);
  const rest = await supabase
    .from("historical_prices")
    .select("date, close, adjusted_close")
    .eq("symbol", symbol)
    .gte("date", fromStr)
    .order("date", { ascending: false })
    .limit(daysToLoad);

  if (rest.error) {
    return { rows: [], error: rest.error.message };
  }
  return { rows: (rest.data ?? []) as HistoryRow[], error: null };
}

async function loadFromRpc(
  supabase: SupabaseClient,
  symbol: string,
  daysToLoad: number
): Promise<{ rows: HistoryRow[]; error: string | null }> {
  const rpc = await supabase.rpc("get_historical_prices", {
    p_symbol: symbol,
    p_days: daysToLoad,
  });
  if (rpc.error) {
    return { rows: [], error: rpc.error.message };
  }
  return { rows: (rpc.data ?? []) as HistoryRow[], error: null };
}

/**
 * iOS chart/SMA/vs-SPY history: GET `historical_prices` and plot `adjusted_close`.
 * Web uses the same table read; RPC is only a fallback when that read is empty or errors.
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
  if (cached?.isFresh && cached.points.length > 0) {
    return { points: cached.points, error: null };
  }

  const rest = await loadFromRest(supabase, sym, n);
  let points = pointsFromHistoryRows(rest.rows, true);

  if (points.length === 0) {
    const rpc = await loadFromRpc(supabase, sym, n);
    if (rpc.error && rest.error) {
      if (cached?.points.length) return { points: cached.points, error: null };
      return { points: [], error: rpc.error };
    }
    points = pointsFromHistoryRows(rpc.rows, false);
  }

  if (points.length === 0) {
    if (cached?.points.length) return { points: cached.points, error: null };
    return { points: [], error: rest.error ?? "No data available" };
  }

  setCachedHistoricalPricePoints(sym, points, { replace: true });
  return { points, error: null };
}
