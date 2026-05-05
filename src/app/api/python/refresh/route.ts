import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncStocksPmAuthUser } from "@/lib/stocks-pm-account";
import {
  fetchTickerHydrationFromTables,
  type TickerHydrationPriceRow,
  type TickerHydrationSentimentRow,
} from "@/lib/ticker-direct-hydration";

const MAX_SYMBOLS = 300;
const FRESH_WINDOW_MS = 5 * 60 * 1000;

type EdgeTickerPrice = {
  symbol: string;
  last_price: number;
  daily_pct_change: number;
  last_updated: string;
  analyst_average?: number | string | null;
  market_cap?: number | null;
  peg_ratio?: number | null;
  beta?: number | null;
  analyst_target?: number | null;
  company_name?: string | null;
  is_etf?: boolean | null;
};

type EdgeTickerSentiment = {
  sentiment_score: number;
};

type EdgeTickerDataResponse = {
  prices?: Record<string, EdgeTickerPrice>;
  sentiment?: Record<string, EdgeTickerSentiment>;
  metrics?: {
    served_from_cache?: string[];
    needs_update?: string[];
    execution_ms?: number;
  };
};

function summarizeFreshness(prices: Record<string, { last_updated?: string | null }>) {
  const freshSymbols: string[] = [];
  const staleSymbols: string[] = [];
  const now = Date.now();

  for (const [symbol, row] of Object.entries(prices)) {
    const updatedAt = row.last_updated ? Date.parse(row.last_updated) : Number.NaN;
    if (Number.isFinite(updatedAt) && now - updatedAt <= FRESH_WINDOW_MS) {
      freshSymbols.push(symbol);
    } else {
      staleSymbols.push(symbol);
    }
  }

  return { freshSymbols, staleSymbols };
}

function getEdgeFunctionUrl() {
  const baseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }
  return `${baseUrl}/functions/v1/fetch-ticker-data`;
}

async function fetchFreshTickerHydration(symbols: string[]) {
  if (symbols.length === 0) {
    return {
      prices: {} as Record<string, TickerHydrationPriceRow>,
      sentiment: {} as Record<string, TickerHydrationSentimentRow>,
      needsUpdate: [] as string[],
    };
  }

  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  const url = new URL(getEdgeFunctionUrl());
  url.searchParams.set("t", `${Date.now()}`);
  url.searchParams.set("force_fresh", "1");
  url.searchParams.set("r", `${Math.floor(Math.random() * 1_000_000)}`);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    cache: "no-store",
    body: JSON.stringify({
      symbols,
      types: ["price", "analyst", "fundamentals", "ai_sentiment"],
      context: "refresh",
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Edge refresh failed with ${response.status}`);
  }

  const data = (await response.json()) as EdgeTickerDataResponse;
  const prices: Record<string, TickerHydrationPriceRow> = {};
  const sentiment: Record<string, TickerHydrationSentimentRow> = {};

  for (const [symbol, row] of Object.entries(data.prices ?? {})) {
    prices[symbol] = {
      symbol: row.symbol,
      last_price: row.last_price,
      daily_pct_change: row.daily_pct_change,
      last_updated: row.last_updated,
      analyst_average: row.analyst_average ?? null,
      market_cap: row.market_cap ?? null,
      peg_ratio: row.peg_ratio ?? null,
      beta: row.beta ?? null,
      analyst_target: row.analyst_target ?? null,
      company_name: row.company_name ?? null,
      is_etf: row.is_etf ?? null,
    };
  }

  for (const [symbol, row] of Object.entries(data.sentiment ?? {})) {
    const score = Number(row.sentiment_score);
    if (Number.isFinite(score)) {
      sentiment[symbol] = { sentiment_score: score };
    }
  }

  return {
    prices,
    sentiment,
    needsUpdate: (data.metrics?.needs_update ?? []).map((symbol) => symbol.trim().toUpperCase()).filter(Boolean),
  };
}

export async function POST(request: NextRequest) {
  let payload: Record<string, unknown> = {};
  try {
    payload = await request.json();
  } catch {
    // fall through with empty payload
  }

  let symbols: string[] = [];
  const includeSnapshot = payload.include_snapshot === true;
  if (Array.isArray(payload.symbols)) {
    symbols = (payload.symbols as unknown[])
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, MAX_SYMBOLS);
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const dataUserId = await syncStocksPmAuthUser(supabase, user.id);
    const [{ prices, sentiment, needsUpdate }, snapshotRes] = await Promise.all([
      fetchFreshTickerHydration(symbols).catch(async () => {
        const fallback = await fetchTickerHydrationFromTables(supabase, symbols);
        return { ...fallback, needsUpdate: [] as string[] };
      }),
      includeSnapshot
        ? supabase.rpc("get_latest_portfolio_snapshot", { p_user_id: dataUserId })
        : Promise.resolve({ data: null, error: null }),
    ]);

    const missingSymbols = symbols.filter((symbol) => !prices[symbol]);
    if (missingSymbols.length > 0) {
      const fallback = await fetchTickerHydrationFromTables(supabase, missingSymbols);
      Object.assign(prices, fallback.prices);
      Object.assign(sentiment, fallback.sentiment);
    }

    const { freshSymbols, staleSymbols } = summarizeFreshness(prices);
    const snapshot = !snapshotRes.error ? snapshotRes.data : null;

    return NextResponse.json({
      ok: true,
      refreshed_at: new Date().toISOString(),
      symbols,
      data_user_id: dataUserId,
      prices,
      sentiment,
      snapshot,
      fresh_symbols: freshSymbols,
      stale_symbols: [...new Set([...staleSymbols, ...needsUpdate])],
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Refresh failed",
      },
      { status: 500 }
    );
  }
}
