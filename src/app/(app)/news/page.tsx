"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Newspaper, RefreshCw, Search, Sparkles } from "lucide-react";
import { usePortfolioStore } from "@/store/portfolioStore";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { runRefreshPipeline } from "@/lib/refresh";
import { APP_CTA_FILL, appCtaButton } from "@/lib/appCtaClasses";
import { cn } from "@/lib/utils";
import {
  fetchNewsFeedFromSupabase,
  filterNewsItems,
  formatNewsRelativeDate,
  sentimentDotClass,
  type NewsFeedItem,
} from "@/lib/news-feed";
import { safeHttpUrlForHref } from "@/lib/safe-external-url";

type FeedFilter = "all" | "macro" | "portfolio";

function sentimentShortLabel(sentiment: string | null): string | null {
  if (!sentiment?.trim()) return null;
  const s = sentiment.toLowerCase();
  if (s === "positive" || s === "bullish") return "Bullish";
  if (s === "negative" || s === "bearish") return "Bearish";
  return "Neutral";
}

function NewsArticleCard({ item }: { item: NewsFeedItem }) {
  const isMacro = item.symbol === "MACRO";
  const rel = formatNewsRelativeDate(item.publishedAt);
  const sentimentLabel = sentimentShortLabel(item.sentiment);

  const inner = (
    <article className="flex h-full flex-col gap-4 rounded-2xl border border-border/80 bg-elevated p-5 shadow-sm transition-[border-color,box-shadow,background-color] duration-200 dark:border-white/[0.08] dark:bg-white/[0.03] sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:p-6">
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex h-7 min-w-[2.25rem] items-center justify-center rounded-lg px-2 text-xs font-bold tracking-wide ring-1",
              isMacro
                ? "bg-amber-500/15 text-amber-800 ring-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200"
                : "bg-primary/12 text-foreground ring-primary/20 dark:bg-primary/15 dark:text-primary"
            )}
            title={isMacro ? "Global markets" : item.symbol}
          >
            {isMacro ? "Macro" : item.symbol}
          </span>
          {sentimentLabel ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-0.5 text-[11px] font-medium text-subtle dark:border-white/[0.08]"
              title={item.sentiment ?? undefined}
            >
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", sentimentDotClass(item.sentiment))} />
              {sentimentLabel}
            </span>
          ) : null}
        </div>
        <h2 className="text-lg font-semibold leading-snug tracking-tight text-foreground sm:text-xl">{item.title}</h2>
        {item.companyName && !isMacro ? (
          <p className="mt-2 text-sm text-subtle">{item.companyName}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle sm:max-w-[14rem] sm:justify-end sm:text-right">
        <span className="font-medium text-foreground/70">{item.source}</span>
        {rel ? (
          <>
            <span aria-hidden className="text-border">
              ·
            </span>
            <time dateTime={item.publishedAtRaw}>{rel}</time>
          </>
        ) : null}
      </div>
    </article>
  );

  const cardHover =
    "group block h-full rounded-2xl no-underline outline-none transition-[transform,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:-translate-y-px hover:shadow-sm dark:focus-visible:ring-offset-background";

  const href = safeHttpUrlForHref(item.url);
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cardHover}>
        {inner}
      </a>
    );
  }

  return <div className={cardHover}>{inner}</div>;
}

export default function NewsPage() {
  const stocks = usePortfolioStore((s) => s.stocks);
  const portfolioSymbols = useMemo(() => new Set(stocks.map((s) => s.symbol.toUpperCase())), [stocks]);
  const symbolsKey = useMemo(
    () =>
      [...stocks]
        .map((x) => x.symbol.toUpperCase())
        .sort()
        .join(","),
    [stocks]
  );

  const [items, setItems] = useState<NewsFeedItem[]>([]);
  const [searchText, setSearchText] = useState("");
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    if (!hasSupabaseConfig()) {
      setItems([]);
      setLoadError(null);
      setLoading(false);
      return;
    }
    const currentStocks = usePortfolioStore.getState().stocks;
    setLoadError(null);
    try {
      const supabase = createClient();
      const { items: next, error } = await fetchNewsFeedFromSupabase(supabase, currentStocks);
      if (error) setLoadError(error);
      setItems(next);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load news");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [symbolsKey, load]);

  const scopedItems = useMemo(() => {
    if (feedFilter === "macro") return items.filter((i) => i.symbol === "MACRO");
    if (feedFilter === "portfolio") return items.filter((i) => i.symbol !== "MACRO" && portfolioSymbols.has(i.symbol));
    return items;
  }, [items, feedFilter, portfolioSymbols]);

  const filtered = useMemo(() => filterNewsItems(scopedItems, searchText), [scopedItems, searchText]);

  const counts = useMemo(() => {
    const macro = items.filter((i) => i.symbol === "MACRO").length;
    const port = items.filter((i) => i.symbol !== "MACRO" && portfolioSymbols.has(i.symbol)).length;
    return { total: items.length, macro, portfolio: port };
  }, [items, portfolioSymbols]);

  async function onRefresh() {
    if (!hasSupabaseConfig()) return;
    setRefreshing(true);
    try {
      const syms = stocks.map((s) => s.symbol).filter(Boolean);
      if (syms.length > 0) {
        await runRefreshPipeline(syms);
      }
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  const showEmpty = !loading && !refreshing && filtered.length === 0;
  const noConfig = !hasSupabaseConfig();

  const filterTabs: { id: FeedFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.total },
    { id: "macro", label: "Macro", count: counts.macro },
    { id: "portfolio", label: "My symbols", count: counts.portfolio },
  ];

  return (
    <div className="space-y-8 pb-10">
      {/* Page header — full width like Portfolio */}
      <div className="flex flex-col gap-6 border-b border-border/60 pb-8 dark:border-white/[0.06] sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/20 dark:bg-primary/15">
              <Newspaper className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">News</h1>
              <p className="mt-1 text-sm text-subtle">Headlines from AI sentiment for your watchlist and macro stories.</p>
            </div>
          </div>
          {!noConfig && !loading && (
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-subtle">
              Same feed as the Stocks PM mobile app. Pull to refresh on iOS; here, use{" "}
              <span className="font-medium text-foreground/80">Refresh</span> to pull the latest.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={refreshing || noConfig}
          className={appCtaButton(
            "ui-hover-spotlight shrink-0 gap-2 px-5 py-3 text-sm shadow-sm disabled:opacity-50"
          )}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden />
          )}
          Refresh feed
        </button>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-12 xl:gap-10">
        {/* Main: article grid — second on mobile so filters appear first */}
        <div className="order-2 min-w-0 xl:order-1 xl:col-span-8">
          {noConfig && (
            <div className="rounded-2xl border border-border/80 bg-elevated p-6 dark:border-white/[0.08]">
              <div className="flex gap-3">
                <Sparkles className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                <p className="text-sm leading-relaxed text-subtle">
                  News from your account isn&apos;t available in this environment. When the app is connected to your backend, headlines for your symbols appear here after
                  they&apos;ve been processed.
                </p>
              </div>
            </div>
          )}

          {loadError && (
            <p className="mb-6 rounded-xl border border-error/30 bg-error-bg px-4 py-3 text-sm text-error" role="alert">
              {loadError}
            </p>
          )}

          {loading && (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-16 dark:border-white/[0.08]">
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
              <p className="text-sm font-medium text-subtle">Loading headlines…</p>
            </div>
          )}

          {refreshing && !loading && (
            <p className="mb-4 flex items-center gap-2 text-sm text-subtle">
              <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
              Refreshing…
            </p>
          )}

          {showEmpty && !noConfig && (
            <div className="rounded-2xl border border-border/80 bg-gradient-to-b from-elevated to-muted/10 px-6 py-16 text-center dark:border-white/[0.08]">
              <p className="text-lg font-semibold text-foreground">No articles match</p>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-subtle">
                Try another filter or search. New stories appear after sentiment runs for your symbols, plus macro picks when available.
              </p>
              <button
                type="button"
                onClick={() => void onRefresh()}
                disabled={refreshing}
                className={appCtaButton("mt-8 px-5 py-2.5 text-sm disabled:opacity-50")}
              >
                Refresh feed
              </button>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-subtle">
                  <span className="font-semibold tabular-nums text-foreground">{filtered.length}</span> article
                  {filtered.length === 1 ? "" : "s"}
                  {searchText.trim() ? " (filtered)" : ""}
                </p>
              </div>
              <ul className="grid grid-cols-1 gap-4">
                {filtered.map((item) => (
                  <li key={item.id} className="list-none">
                    <NewsArticleCard item={item} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Sidebar: filters + search + symbol detail */}
        <aside className="order-1 min-w-0 space-y-6 xl:order-2 xl:col-span-4 xl:sticky xl:top-6 xl:self-start">
          {!noConfig && (
            <>
              <div className="rounded-2xl border border-border/80 bg-elevated p-1 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
                <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">View</p>
                <div className="mt-2 flex flex-col gap-1 p-1 sm:flex-row sm:flex-wrap xl:flex-col">
                  {filterTabs.map((t) => {
                    const active = feedFilter === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setFeedFilter(t.id)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors sm:w-auto sm:min-w-[7.5rem] xl:w-full",
                          active ? cn(APP_CTA_FILL, "shadow-sm") : "text-foreground hover:bg-muted/60 dark:hover:bg-white/[0.06]"
                        )}
                      >
                        <span>{t.label}</span>
                        <span
                          className={cn(
                            "tabular-nums text-xs font-bold",
                            active ? "text-[color:var(--landing-cta-text)]/85" : "text-subtle"
                          )}
                        >
                          {t.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-border/80 bg-elevated p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">Search</label>
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
                  <input
                    type="search"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Symbol, headline, source…"
                    className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-3 text-sm text-foreground placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/35 dark:border-white/10 dark:bg-black/20"
                    aria-label="Search news"
                  />
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
