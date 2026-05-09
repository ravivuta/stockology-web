"use client";

import { useEffect, useMemo, useRef } from "react";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { isIosAlignedAutoRefreshWindowOpen } from "@/lib/market-hours";
import {
  hasFreshRecommendationHistory,
  setRecommendationHistory,
} from "@/lib/recommendation-history-cache";
import { runRefreshPipeline } from "@/lib/refresh";
import { fetchHistoricalPricePoints } from "@/lib/supabase-stock-history";
import { usePortfolioStore } from "@/store/portfolioStore";

const INITIAL_REFRESH_DELAY_MS = 800;
const AUTO_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const FOCUS_REFRESH_MIN_STALE_MS = 3 * 60 * 1000;
const AUTO_OPTIMIZE_COOLDOWN_MS = 30 * 60 * 1000;
const HISTORY_DAYS = 400;
const HISTORY_FETCH_BATCH = 6;

type RefreshReason = "init" | "visible" | "interval";

export function useHydrateTickerFundamentals(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const stocks = usePortfolioStore((s) => s.stocks);
  const lastRefreshAt = usePortfolioStore((s) => s.lastRefreshAt);

  const symbols = useMemo(
    () =>
      [...new Set(stocks.map((stock) => stock.symbol.trim().toUpperCase()).filter(Boolean))].sort(),
    [stocks]
  );
  const symbolsKey = useMemo(() => symbols.join(","), [symbols]);
  const needsHydration = useMemo(
    () =>
      stocks.some(
        (stock) =>
          !Number.isFinite(stock.lastPrice ?? Number.NaN) ||
          (stock.lastPrice ?? 0) <= 0 ||
          stock.analystTarget == null ||
          stock.aiSentimentScore == null
      ),
    [stocks]
  );

  const inFlightRef = useRef(false);
  const historyInFlightRef = useRef(false);
  const lastAutoOptimizeAtRef = useRef(0);

  useEffect(() => {
    if (!enabled || !hasSupabaseConfig() || symbols.length === 0) return;

    const refreshAgeMs = lastRefreshAt ? Date.now() - Date.parse(lastRefreshAt) : Number.POSITIVE_INFINITY;

    function shouldRun(reason: RefreshReason) {
      if (symbols.length === 0) return false;
      if (reason === "interval" && !isIosAlignedAutoRefreshWindowOpen()) return false;
      if (needsHydration) return true;
      if (!Number.isFinite(refreshAgeMs)) return true;
      if (reason === "visible") return refreshAgeMs >= FOCUS_REFRESH_MIN_STALE_MS;
      return refreshAgeMs >= AUTO_REFRESH_INTERVAL_MS;
    }

    function shouldOptimize(reason: RefreshReason) {
      const hasPending = usePortfolioStore.getState().stocks.some((stock) => stock.pendingOptimization);
      if (!hasPending) return false;
      if (reason !== "interval") return true;
      return Date.now() - lastAutoOptimizeAtRef.current >= AUTO_OPTIMIZE_COOLDOWN_MS;
    }

    async function refresh(reason: RefreshReason) {
      if (inFlightRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (!shouldRun(reason)) return;

      inFlightRef.current = true;
      const optimizePending = shouldOptimize(reason);
      try {
        const result = await runRefreshPipeline(symbols, {
          optimizePending,
          includeSnapshot: true,
        });
        if (result.ok && optimizePending) {
          lastAutoOptimizeAtRef.current = Date.now();
        }
      } finally {
        inFlightRef.current = false;
      }
    }

    async function hydrateHistory() {
      if (historyInFlightRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

      const missingSymbols = symbols.filter((symbol) => !hasFreshRecommendationHistory(symbol));
      if (missingSymbols.length === 0) return;

      historyInFlightRef.current = true;
      try {
        const supabase = createClient();
        let appliedAny = false;
        for (let index = 0; index < missingSymbols.length; index += HISTORY_FETCH_BATCH) {
          const batch = missingSymbols.slice(index, index + HISTORY_FETCH_BATCH);
          const results = await Promise.all(
            batch.map(async (symbol) => {
              const { points, error } = await fetchHistoricalPricePoints(supabase, symbol, HISTORY_DAYS);
              return { symbol, points, error };
            })
          );
          for (const result of results) {
            if (result.error || result.points.length === 0) continue;
            setRecommendationHistory(
              result.symbol,
              result.points.map((point) => point.close)
            );
            appliedAny = true;
          }
        }
        if (appliedAny) {
          usePortfolioStore.getState().recalcMetrics();
        }
      } finally {
        historyInFlightRef.current = false;
      }
    }

    const timer = window.setTimeout(() => {
      void refresh("init");
      void hydrateHistory();
    }, INITIAL_REFRESH_DELAY_MS);

    const interval = window.setInterval(() => {
      void refresh("interval");
      void hydrateHistory();
    }, AUTO_REFRESH_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh("visible");
        void hydrateHistory();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, lastRefreshAt, needsHydration, symbols, symbolsKey]);
}
