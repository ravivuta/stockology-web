import type { SupabaseClient } from "@supabase/supabase-js";
import { parseStockPeg } from "@/lib/stock-metric-parse";
import type { StockHolding } from "@/store/portfolioStore";

/** Same shape as fetch-ticker-data `prices[sym]` for {@link mapPriceRowToPatch}. */
export type TickerHydrationPriceRow = {
  symbol?: string;
  last_price?: number;
  daily_pct_change?: number;
  last_updated?: string | null;
  analyst_target?: number | null;
  analyst_average?: number | string | null;
  market_cap?: number | null;
  peg_ratio?: number | null;
  return_on_equity?: number | null;
  profit_margin?: number | null;
  trailing_pe?: number | null;
  debt_to_equity?: number | null;
  beta?: number | null;
  company_name?: string | null;
  is_etf?: boolean | null;
};

export type TickerHydrationSentimentRow = {
  sentiment_score: number;
  last_updated?: string;
};

export function mapTickerHydrationPriceRowToPatch(
  p: TickerHydrationPriceRow,
  sentiment?: TickerHydrationSentimentRow | null
): Partial<StockHolding> {
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
    const target = Number(p.analyst_target);
    if (Number.isFinite(target) && target > 0) patch.analystTarget = target;
  }
  const analystAverage = p.analyst_average;
  if (analystAverage != null) {
    if (typeof analystAverage === "number" && Number.isFinite(analystAverage)) {
      patch.analystAvg = analystAverage.toFixed(2);
    } else if (typeof analystAverage === "string" && analystAverage.trim()) {
      const parsed = parseFloat(analystAverage);
      patch.analystAvg = Number.isFinite(parsed) ? parsed.toFixed(2) : analystAverage.trim();
    }
  }
  if (p.market_cap != null) {
    const marketCap = Number(p.market_cap);
    if (Number.isFinite(marketCap) && marketCap > 0) patch.marketCap = marketCap;
  }
  const peg = parseStockPeg(p.peg_ratio);
  if (peg !== undefined) patch.peg = peg;
  if (p.return_on_equity != null) {
    const roe = Number(p.return_on_equity);
    if (Number.isFinite(roe)) patch.returnOnEquity = roe;
  }
  if (p.profit_margin != null) {
    const margin = Number(p.profit_margin);
    if (Number.isFinite(margin)) patch.profitMargin = margin;
  }
  if (p.trailing_pe != null) {
    const trailingPe = Number(p.trailing_pe);
    if (Number.isFinite(trailingPe) && trailingPe > 0) patch.trailingPE = trailingPe;
  }
  if (p.debt_to_equity != null) {
    const debtToEquity = Number(p.debt_to_equity);
    if (Number.isFinite(debtToEquity) && debtToEquity >= 0) patch.debtToEquity = debtToEquity;
  }
  if (p.beta != null) {
    const beta = Number(p.beta);
    if (Number.isFinite(beta)) patch.beta = beta;
  }
  if (p.is_etf === true) patch.isETF = true;
  else if (p.is_etf === false) patch.isETF = false;
  if (sentiment?.sentiment_score != null && Number.isFinite(Number(sentiment.sentiment_score))) {
    patch.aiSentimentScore = Number(sentiment.sentiment_score);
  }
  if (sentiment?.last_updated) {
    patch.aiSentimentLastUpdated = sentiment.last_updated;
  }
  return patch;
}

/**
 * Load live prices + fundamentals from Supabase tables (same sources as fetch-ticker-data
 * refresh path). Works without invoking edge functions.
 */
export async function fetchTickerHydrationFromTables(
  supabase: SupabaseClient,
  symbols: string[]
): Promise<{ prices: Record<string, TickerHydrationPriceRow>; sentiment: Record<string, TickerHydrationSentimentRow> }> {
  const upper = [...new Set(symbols.map((s) => s.trim().toUpperCase()))].filter(Boolean);
  if (upper.length === 0) return { prices: {}, sentiment: {} };

  const [pricesRes, fundRes, sentRes] = await Promise.all([
    supabase
      .from("ticker_prices")
      .select("symbol, last_price, daily_pct_change, last_updated")
      .in("symbol", upper)
      .eq("skip", false)
      .gt("last_price", 0),
    supabase
      .from("ticker_data")
      .select(
        "symbol, analyst_average, market_cap, peg_ratio, return_on_equity, profit_margin, trailing_pe, debt_to_equity, analyst_target, beta, company_name, consensus_conclusion, is_etf"
      )
      .in("symbol", upper),
    supabase.from("ai_sentiment_scores").select("symbol, sentiment_score, last_updated").in("symbol", upper),
  ]);

  const fundBySym: Record<string, Record<string, unknown>> = {};
  for (const row of fundRes.data ?? []) {
    const raw = row.symbol as string;
    if (!raw) continue;
    fundBySym[raw.trim().toUpperCase()] = row as Record<string, unknown>;
  }

  function mergeFundamentals(sym: string, f: Record<string, unknown>): Pick<
    TickerHydrationPriceRow,
    | "analyst_average"
    | "market_cap"
    | "peg_ratio"
    | "return_on_equity"
    | "profit_margin"
    | "trailing_pe"
    | "debt_to_equity"
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
      return_on_equity: f.return_on_equity != null ? Number(f.return_on_equity) : null,
      profit_margin: f.profit_margin != null ? Number(f.profit_margin) : null,
      trailing_pe: f.trailing_pe != null ? Number(f.trailing_pe) : null,
      debt_to_equity: f.debt_to_equity != null ? Number(f.debt_to_equity) : null,
      analyst_target: f.analyst_target != null ? Number(f.analyst_target) : null,
      beta: f.beta != null ? Number(f.beta) : null,
      company_name: typeof f.company_name === "string" ? f.company_name : null,
      is_etf: typeof f.is_etf === "boolean" ? f.is_etf : null,
    };
  }

  const prices: Record<string, TickerHydrationPriceRow> = {};
  for (const row of pricesRes.data ?? []) {
    const raw = row.symbol as string;
    if (!raw) continue;
    const sym = raw.trim().toUpperCase();
    const f = fundBySym[sym] ?? {};
    prices[sym] = {
      symbol: sym,
      last_price: row.last_price != null ? Number(row.last_price) : undefined,
      daily_pct_change: row.daily_pct_change != null ? Number(row.daily_pct_change) : undefined,
      last_updated: typeof row.last_updated === "string" ? row.last_updated : null,
      ...mergeFundamentals(sym, f),
    };
  }

  for (const sym of upper) {
    if (prices[sym] || !fundBySym[sym]) continue;
    prices[sym] = { symbol: sym, ...mergeFundamentals(sym, fundBySym[sym]) };
  }

  const sentiment: Record<string, TickerHydrationSentimentRow> = {};
  for (const row of sentRes.data ?? []) {
    const sym = row.symbol as string;
    if (!sym || row.sentiment_score == null) continue;
    const sc = Number(row.sentiment_score);
    if (Number.isFinite(sc)) sentiment[sym] = { sentiment_score: sc };
  }

  return { prices, sentiment };
}
