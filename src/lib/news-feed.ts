import type { SupabaseClient } from "@supabase/supabase-js";
import { safeHttpUrlForHref } from "@/lib/safe-external-url";

/** One article from `ai_sentiment_scores.news_sources` (matches iOS / edge function shape). */
export type NewsSourceRow = {
  title?: string;
  url?: string;
  published_at?: string;
  source?: string;
  sentiment?: string;
};

export type NewsFeedItem = {
  id: string;
  symbol: string;
  companyName: string | null;
  title: string;
  url: string | null;
  source: string;
  publishedAt: Date;
  publishedAtRaw: string;
  sentiment: string | null;
};

export function parseNewsPublishedAt(raw: string): Date {
  if (!raw || !raw.trim()) return new Date(0);
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return new Date(parsed);
  const ymd = raw.slice(0, 10);
  const ymdMs = Date.parse(`${ymd}T12:00:00Z`);
  if (!Number.isNaN(ymdMs)) return new Date(ymdMs);
  return new Date(0);
}

function highlightsFromRow(raw: unknown): NewsSourceRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is NewsSourceRow => x != null && typeof x === "object");
}

function stableItemId(symbol: string, title: string, url: string | null, publishedAtRaw: string): string {
  const u = url ?? "";
  return `${symbol}|${title}|${u}|${publishedAtRaw}`.slice(0, 400);
}

/**
 * Flatten `news_sources` from Supabase rows into a single timeline (same rules as iOS `NewsTabView`).
 */
export function buildNewsFeedItems(
  rows: { symbol: string; news_sources: unknown }[],
  symbolToCompany: Map<string, string | null>
): NewsFeedItem[] {
  const items: NewsFeedItem[] = [];

  for (const row of rows) {
    const sym = row.symbol?.toUpperCase() === "MACRO" ? "MACRO" : (row.symbol ?? "").toUpperCase();
    const companyName = sym === "MACRO" ? "Global Markets" : symbolToCompany.get(sym) ?? null;

    for (const h of highlightsFromRow(row.news_sources)) {
      const title = typeof h.title === "string" ? h.title.trim() : "";
      if (!title) continue;
      const publishedAtRaw = typeof h.published_at === "string" ? h.published_at : "";
      const rawUrl = typeof h.url === "string" && h.url.trim() ? h.url.trim() : null;
      const url = safeHttpUrlForHref(rawUrl);
      const source =
        typeof h.source === "string" && h.source.trim() ? h.source.trim() : sym === "MACRO" ? "Macro" : "News";
      const sentiment = typeof h.sentiment === "string" ? h.sentiment : null;

      items.push({
        id: stableItemId(sym, title, url, publishedAtRaw),
        symbol: sym,
        companyName,
        title,
        url,
        source,
        publishedAt: parseNewsPublishedAt(publishedAtRaw),
        publishedAtRaw,
        sentiment,
      });
    }
  }

  const seen = new Set<string>();
  const unique = items.filter((it) => {
    const k = it.title;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  unique.sort((a, b) => {
    if (a.publishedAt.getTime() !== b.publishedAt.getTime()) {
      return b.publishedAt.getTime() - a.publishedAt.getTime();
    }
    const ua = a.url ?? a.title;
    const ub = b.url ?? b.title;
    return ua.localeCompare(ub);
  });

  return unique;
}

type ScoreRow = {
  symbol: string;
  news_sources: unknown;
  last_updated?: string;
};

/**
 * Latest row per symbol (if duplicates exist).
 */
function dedupeRowsBySymbol(rows: ScoreRow[]): ScoreRow[] {
  const sorted = [...rows].sort((a, b) => {
    const ta = a.last_updated ? new Date(a.last_updated).getTime() : 0;
    const tb = b.last_updated ? new Date(b.last_updated).getTime() : 0;
    return tb - ta;
  });
  const map = new Map<string, ScoreRow>();
  for (const r of sorted) {
    if (!map.has(r.symbol)) map.set(r.symbol, r);
  }
  return [...map.values()];
}

export async function fetchNewsFeedFromSupabase(
  supabase: SupabaseClient,
  stocks: { symbol: string; name?: string }[]
): Promise<{ items: NewsFeedItem[]; error: string | null }> {
  const upper = [...new Set(stocks.map((s) => s.symbol.trim().toUpperCase()).filter(Boolean))];
  const querySymbols = [...new Set([...upper, "MACRO"])];

  const symbolToCompany = new Map<string, string | null>();
  for (const s of stocks) {
    symbolToCompany.set(s.symbol.toUpperCase(), s.name ?? null);
  }

  const { data, error } = await supabase
    .from("ai_sentiment_scores")
    .select("symbol, news_sources, last_updated")
    .in("symbol", querySymbols);

  if (error) {
    return { items: [], error: error.message };
  }

  const rows = dedupeRowsBySymbol((data ?? []) as ScoreRow[]);
  const items = buildNewsFeedItems(rows, symbolToCompany);
  return { items, error: null };
}

export function filterNewsItems(items: NewsFeedItem[], searchText: string): NewsFeedItem[] {
  const q = searchText.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (it) =>
      it.symbol.toLowerCase().includes(q) ||
      it.title.toLowerCase().includes(q) ||
      it.source.toLowerCase().includes(q) ||
      (it.companyName?.toLowerCase().includes(q) ?? false)
  );
}

export function formatNewsRelativeDate(d: Date): string {
  if (d.getTime() === 0) return "";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayDiff = Math.round((startOfToday.getTime() - startOfThat.getTime()) / (24 * 60 * 60 * 1000));

  if (dayDiff === 0) {
    const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }
  if (dayDiff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function sentimentDotClass(sentiment: string | null): string {
  const s = (sentiment ?? "").toLowerCase();
  if (s === "positive" || s === "bullish") return "bg-emerald-500";
  if (s === "negative" || s === "bearish") return "bg-red-500";
  return "bg-amber-500";
}
