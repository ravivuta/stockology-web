import type { SupabaseClient } from "@supabase/supabase-js";
import { getCachedHistoricalPricePoints, setCachedHistoricalPricePoints } from "@/lib/historical-price-cache";
import type { PricePoint } from "@/lib/stock-chart";

type RpcRow = {
  date: string;
  close: number | null;
  adjusted_close?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  volume?: number | null;
};

const MAX_DAYS = 2000;
const MASTER_CACHE_DAYS = MAX_DAYS;

/**
 * Loads daily closes from `historical_prices` via `get_historical_prices` RPC.
 * Returns points sorted ascending by calendar date (oldest first) for charting.
 *
 * Note: The iOS app does **not** call this RPC — it uses `GET /rest/v1/historical_prices`
 * (see `SupabaseHistoricalService.swift`). Adding or changing this RPC does not affect iOS
 * as long as the `historical_prices` table and RLS stay the same.
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

  // Web uses one master per-symbol history cache. Fetch the full stored horizon once,
  // then serve shorter ranges locally for charts, recommendations, and simulations.
  const requestDays = MASTER_CACHE_DAYS;

  // Single DB signature (text, int). Named args must not be split across two overloads.
  const { data, error } = await supabase.rpc("get_historical_prices", {
    p_symbol: sym,
    p_days: requestDays,
  });

  if (error) {
    if (cached) {
      return { points: cached.points, error: null };
    }
    return { points: [], error: error.message };
  }

  const rows = (data ?? []) as RpcRow[];
  const rowTuples = rows.map((row, index) => ({
    date:
      typeof row.date === "string"
        ? row.date.slice(0, 10)
        : row.date != null
          ? String(row.date).slice(0, 10)
          : "",
    rawClose: row.close != null ? Number(row.close) : NaN,
    adjustedClose: row.adjusted_close != null ? Number(row.adjusted_close) : null,
    index,
  }));

  const resolved = rowTuples.map((row, index) => {
    const rawClose = Number.isFinite(row.rawClose) ? row.rawClose : NaN;
    const adjustedClose = row.adjustedClose != null && Number.isFinite(row.adjustedClose) ? row.adjustedClose : null;

    if (!Number.isFinite(rawClose) || rawClose <= 0) {
      return { date: row.date, close: NaN };
    }

    if (adjustedClose != null && adjustedClose > 0) {
      return { date: row.date, close: adjustedClose };
    }

    const candidateOffsets = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (const offset of candidateOffsets) {
      if (index - offset >= 0) {
        const prev = rowTuples[index - offset];
        const prevAdjusted = prev.adjustedClose != null && Number.isFinite(prev.adjustedClose) ? prev.adjustedClose : null;
        if (prevAdjusted != null && prevAdjusted > 0 && prev.rawClose > 0) {
          const ratio = prev.rawClose / prevAdjusted;
          const rounded = Math.round(ratio);
          if (ratio > 1.2 && Math.abs(rounded - ratio) <= 0.1) {
            return { date: row.date, close: rawClose / rounded };
          }
        }
      }
      if (index + offset < rowTuples.length) {
        const next = rowTuples[index + offset];
        const nextAdjusted = next.adjustedClose != null && Number.isFinite(next.adjustedClose) ? next.adjustedClose : null;
        if (nextAdjusted != null && nextAdjusted > 0 && next.rawClose > 0) {
          const ratio = next.rawClose / nextAdjusted;
          const rounded = Math.round(ratio);
          if (ratio > 1.2 && Math.abs(rounded - ratio) <= 0.1) {
            return { date: row.date, close: rawClose / rounded };
          }
        }
      }
    }

    return { date: row.date, close: rawClose };
  });

  const points: PricePoint[] = resolved
    .filter((p) => p.date.length >= 10 && Number.isFinite(p.close))
    .sort((a, b) => a.date.localeCompare(b.date));

  setCachedHistoricalPricePoints(sym, points);

  return { points, error: null };
}
