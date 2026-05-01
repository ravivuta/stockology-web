import type { SupabaseClient } from "@supabase/supabase-js";
import { parseStockPeg } from "@/lib/stock-metric-parse";

/** Same shape as fetch-ticker-data `prices[sym]` for {@link mapPriceRowToPatch}. */
export type TickerHydrationPriceRow = {
  symbol?: string;
  last_price?: number;
  daily_pct_change?: number;
  analyst_target?: number | null;
  analyst_average?: number | string | null;
  market_cap?: number | null;
  peg_ratio?: number | null;
  beta?: number | null;
  company_name?: string | null;
  is_etf?: boolean | null;
};

/**
 * Load live prices + fundamentals from Supabase tables (same sources as fetch-ticker-data
 * refresh path). Works without invoking edge functions.
 */
export async function fetchTickerHydrationFromTables(
  supabase: SupabaseClient,
  symbols: string[]
): Promise<{ prices: Record<string, TickerHydrationPriceRow>; sentiment: Record<string, { sentiment_score: number }> }> {
  const upper = [...new Set(symbols.map((s) => s.trim().toUpperCase()))].filter(Boolean);
  if (upper.length === 0) return { prices: {}, sentiment: {} };

  const [pricesRes, fundRes, sentRes] = await Promise.all([
    supabase
      .from("ticker_prices")
      .select("symbol, last_price, daily_pct_change")
      .in("symbol", upper)
      .eq("skip", false)
      .gt("last_price", 0),
    supabase
      .from("ticker_data")
      .select(
        "symbol, analyst_average, market_cap, peg_ratio, analyst_target, beta, company_name, consensus_conclusion, is_etf"
      )
      .in("symbol", upper),
    supabase.from("ai_sentiment_scores").select("symbol, sentiment_score").in("symbol", upper),
  ]);

  const fundBySym: Record<string, Record<string, unknown>> = {};
  for (const row of fundRes.data ?? []) {
    const sym = row.symbol as string;
    if (sym) fundBySym[sym] = row as Record<string, unknown>;
  }

  function mergeFundamentals(sym: string, f: Record<string, unknown>): Pick<
    TickerHydrationPriceRow,
    | "analyst_average"
    | "market_cap"
    | "peg_ratio"
    | "analyst_target"
    | "beta"
    | "company_name"
    | "is_etf"
  > {
    const rawAa = f.analyst_average;
    let analyst_average: number | string | null = null;
    if (rawAa != null && rawAa !== "") {
      if (typeof rawAa === "number" && Number.isFinite(rawAa)) analyst_average = rawAa;
      else if (typeof rawAa === "string") {
        const n = parseFloat(rawAa);
        analyst_average = Number.isFinite(n) ? n : rawAa.trim();
      }
    }
    return {
      analyst_average,
      market_cap: f.market_cap != null ? Number(f.market_cap) : null,
      peg_ratio: parseStockPeg(f.peg_ratio) ?? null,
      analyst_target: f.analyst_target != null ? Number(f.analyst_target) : null,
      beta: f.beta != null ? Number(f.beta) : null,
      company_name: typeof f.company_name === "string" ? f.company_name : null,
      is_etf: typeof f.is_etf === "boolean" ? f.is_etf : null,
    };
  }

  const prices: Record<string, TickerHydrationPriceRow> = {};
  for (const row of pricesRes.data ?? []) {
    const sym = row.symbol as string;
    if (!sym) continue;
    const f = fundBySym[sym] ?? {};
    prices[sym] = {
      symbol: sym,
      last_price: row.last_price != null ? Number(row.last_price) : undefined,
      daily_pct_change: row.daily_pct_change != null ? Number(row.daily_pct_change) : undefined,
      ...mergeFundamentals(sym, f),
    };
  }

  for (const sym of upper) {
    if (prices[sym] || !fundBySym[sym]) continue;
    prices[sym] = { symbol: sym, ...mergeFundamentals(sym, fundBySym[sym]) };
  }

  const sentiment: Record<string, { sentiment_score: number }> = {};
  for (const row of sentRes.data ?? []) {
    const sym = row.symbol as string;
    if (!sym || row.sentiment_score == null) continue;
    const sc = Number(row.sentiment_score);
    if (Number.isFinite(sc)) sentiment[sym] = { sentiment_score: sc };
  }

  return { prices, sentiment };
}
