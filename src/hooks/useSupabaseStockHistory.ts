"use client";

import { useEffect, useState } from "react";
import type { PricePoint } from "@/lib/stock-chart";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { fetchHistoricalPricePoints } from "@/lib/supabase-stock-history";

const DEFAULT_DAYS = 400;

/** Daily OHLC history from the account backend when configured; otherwise callers fall back to public data. */
export function useSupabaseStockHistory(symbol: string | null, days: number = DEFAULT_DAYS) {
  const [points, setPoints] = useState<PricePoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) {
      setPoints(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (!hasSupabaseConfig()) {
      setPoints(null);
      setError("Saved price history isn’t available in this environment.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const supabase = createClient();
        const { points: pts, error: err } = await fetchHistoricalPricePoints(supabase, symbol, days);
        if (cancelled) return;
        if (err) {
          setPoints([]);
          setError(err);
          return;
        }
        setPoints(pts);
      } catch (e) {
        if (!cancelled) {
          setPoints([]);
          setError(e instanceof Error ? e.message : "History error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [symbol, days]);

  return { points, loading, error };
}
