"use client";

import { useEffect } from "react";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { fetchTickerHydrationFromTables } from "@/lib/ticker-direct-hydration";
import { parseStockPeg } from "@/lib/stock-metric-parse";
import { usePortfolioStore, type StockHolding } from "@/store/portfolioStore";

const INITIAL_HYDRATION_DELAY_MS = 600;
const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

type EdgePriceRow = {
  symbol?: string;
  last_price?: number;
  daily_pct_change?: number;
  analyst_target?: number | null;
  analyst_average?: number | string | null;
  market_cap?: number | null;
  peg_ratio?: number | string | null;
  peg?: number | string | null;
  beta?: number | null;
  company_name?: string | null;
  is_etf?: boolean | null;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function mapPriceRowToPatch(p: EdgePriceRow): Partial<StockHolding> {
  const patch: Partial<StockHolding> = {};
  if (p.last_price != null && Number.isFinite(Number(p.last_price))) {
    patch.lastPrice = Number(p.last_price);
  }
  if (p.daily_pct_change != null && Number.isFinite(Number(p.daily_pct_change))) {
    patch.dailyChangePercent = Number(p.daily_pct_change);
  }
  if (typeof p.company_name === "string" && p.company_name.trim()) {
    patch.name = p.company_name.trim();
  }
  if (p.analyst_target != null) {
    const t = Number(p.analyst_target);
    if (Number.isFinite(t) && t > 0) patch.analystTarget = t;
  }
  const aa = p.analyst_average;
  if (aa != null) {
    if (typeof aa === "number" && Number.isFinite(aa)) patch.analystAvg = aa.toFixed(2);
    else if (typeof aa === "string" && aa.trim()) {
      const n = parseFloat(aa);
      patch.analystAvg = Number.isFinite(n) ? n.toFixed(2) : aa.trim();
    }
  }
  if (p.market_cap != null) {
    const mc = Number(p.market_cap);
    if (Number.isFinite(mc) && mc > 0) patch.marketCap = mc;
  }
  const pegVal = parseStockPeg(p.peg_ratio ?? p.peg);
  if (pegVal !== undefined) patch.peg = pegVal;
  if (p.beta != null) {
    const b = Number(p.beta);
    if (Number.isFinite(b)) patch.beta = b;
  }
  if (p.is_etf === true) patch.isETF = true;
  else if (p.is_etf === false) patch.isETF = false;
  return patch;
}

/**
 * Pulls prices + fundamentals from `ticker_prices` / `ticker_data` / `ai_sentiment_scores`
 * (same sources as the fetch-ticker-data refresh path) so watchlist and detail panels work
 * without relying on edge function deploy or invoke.
 */
export function useHydrateTickerFundamentals() {
  const symbolsKey = usePortfolioStore((s) =>
    [...new Set(s.stocks.map((x) => x.symbol))].sort().join(",")
  );
  const updateStock = usePortfolioStore((s) => s.updateStock);

  useEffect(() => {
    if (!hasSupabaseConfig()) return;
    const symbols = symbolsKey
      .split(",")
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean);
    if (symbols.length === 0) return;

    let cancelled = false;
    let inFlight = false;

    const hydrate = async () => {
      if (cancelled || inFlight) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

      inFlight = true;
      let appliedAnyPatch = false;
      let completed = false;

      try {
        const supabase = createClient();
        for (const batch of chunk(symbols, 35)) {
          if (cancelled) break;
          const { prices, sentiment } = await fetchTickerHydrationFromTables(supabase, batch);
          if (cancelled) break;
          for (const sym of Object.keys(prices)) {
            const row = prices[sym];
            if (!row) continue;
            const patch = mapPriceRowToPatch(row as EdgePriceRow);
            const sent = sentiment[sym];
            if (sent?.sentiment_score != null && Number.isFinite(Number(sent.sentiment_score))) {
              patch.aiSentimentScore = Number(sent.sentiment_score);
            }
            if (Object.keys(patch).length > 0) {
              appliedAnyPatch = true;
              updateStock(sym, patch);
            }
          }
        }
        completed = true;
      } catch (e) {
        console.warn("[ticker fundamentals]", e instanceof Error ? e.message : e);
      } finally {
        if (!cancelled && completed) {
          if (appliedAnyPatch) {
            usePortfolioStore.getState().recalcMetrics();
          }
          usePortfolioStore.setState({ lastRefreshAt: new Date().toISOString() });
        }
        inFlight = false;
      }
    };

    const timer = setTimeout(() => {
      void hydrate();
    }, INITIAL_HYDRATION_DELAY_MS);

    const interval = setInterval(() => {
      void hydrate();
    }, AUTO_REFRESH_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void hydrate();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(interval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
  }, [symbolsKey, updateStock]);
}
