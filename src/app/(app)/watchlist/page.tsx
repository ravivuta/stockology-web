"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { appCtaButton } from "@/lib/appCtaClasses";
import { usePortfolioStore } from "@/store/portfolioStore";
import { analystTargetUpsidePct, formatUpsidePct } from "@/lib/marketFormat";
import { formatCurrency, formatDecimal, formatPercent } from "@/lib/numberFormat";
import { recommendationActionDisplay } from "@/lib/recommendation";
import { CsvImportExportBar } from "@/components/portfolio/CsvImportExportBar";
import { SymbolTradeCombobox } from "@/components/portfolio/SymbolTradeCombobox";
import { StockDetailModal } from "@/components/stock/StockDetailModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SortableHeaderCell, type SortDirection } from "@/components/ui/SortableHeaderCell";
import { flushCurrentPortfolioSnapshotNow } from "@/lib/portfolio-snapshot-client";

type SortKey = "symbol" | "lastPrice" | "change" | "analyst" | "upside" | "score" | "signal";

const DEFAULT_SORT_DIRECTION: Record<SortKey, SortDirection> = {
  symbol: "asc",
  lastPrice: "desc",
  change: "desc",
  analyst: "desc",
  upside: "desc",
  score: "desc",
  signal: "asc",
};

function recBadgeClass(action: string): string {
  const u = action.toUpperCase();
  if (u === "SELL")
    return "bg-error/15 text-error dark:bg-error/25 dark:text-[color-mix(in_srgb,var(--palette-alice)_88%,white)]";
  if (u === "REDUCE") return "bg-amber-500/15 text-amber-800 dark:bg-amber-400/20 dark:text-amber-200";
  if (u.startsWith("WAIT")) return "bg-muted/80 text-subtle dark:bg-white/[0.08]";
  return "bg-primary/15 text-primary dark:bg-primary/20 dark:text-primary";
}

function scoreTextClass(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "text-subtle";
  if (score >= 90) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 80) return "text-emerald-600/90 dark:text-emerald-300";
  if (score >= 70) return "text-primary dark:text-primary";
  if (score >= 60) return "text-amber-600 dark:text-amber-300";
  if (score >= 50) return "text-red-600/85 dark:text-red-300";
  return "text-red-600 dark:text-red-400";
}

function upsideTextClass(upside: number | null | undefined): string {
  if (upside == null || !Number.isFinite(upside)) return "text-subtle";
  if (upside > 0) return "text-emerald-600 dark:text-emerald-400";
  if (upside < 0) return "text-red-600 dark:text-red-400";
  return "text-subtle";
}

function analystRatingTextClass(value: string | null | undefined): string {
  const rating = typeof value === "string" ? Number.parseFloat(value) : Number.NaN;
  if (!Number.isFinite(rating)) return "text-subtle";
  if (rating >= 4.5) return "text-emerald-600 dark:text-emerald-400";
  if (rating >= 4.0) return "text-emerald-600/90 dark:text-emerald-300";
  if (rating >= 3.5) return "text-primary dark:text-primary";
  if (rating >= 3.0) return "text-amber-600 dark:text-amber-300";
  if (rating >= 2.5) return "text-red-600/85 dark:text-red-300";
  return "text-red-600 dark:text-red-400";
}

function columnFilterClass(active: boolean, tone: "amber" | "emerald") {
  const base =
    "rounded-full border px-2.5 py-1 text-[10px] font-semibold normal-case tracking-normal transition-colors";
  if (tone === "amber") {
    return active
      ? `${base} border-[#c79400]/45 bg-[#f3c74a]/42 text-[#6b4b00] dark:border-[#f3c74a]/45 dark:bg-[#f3c74a]/24 dark:text-[#f6d97d]`
      : `${base} border-[#d8b44a]/35 bg-[#f3c74a]/20 text-[#8a6500] hover:border-[#c79400]/35 hover:bg-[#f3c74a]/28 dark:border-[#f3c74a]/20 dark:bg-[#f3c74a]/14 dark:text-[#e7cb72] dark:hover:bg-[#f3c74a]/20`;
  }
  return active
    ? `${base} border-[#c79400]/45 bg-[#f3c74a]/42 text-[#6b4b00] dark:border-[#f3c74a]/45 dark:bg-[#f3c74a]/24 dark:text-[#f6d97d]`
    : `${base} border-[#d8b44a]/35 bg-[#f3c74a]/20 text-[#8a6500] hover:border-[#c79400]/35 hover:bg-[#f3c74a]/28 dark:border-[#f3c74a]/20 dark:bg-[#f3c74a]/14 dark:text-[#e7cb72] dark:hover:bg-[#f3c74a]/20`;
}

/**
 * Watchlist page shows watch-only symbols. Active holdings stay on Portfolio.
 */
export default function WatchlistPage() {
  const stocks = usePortfolioStore((s) => s.stocks);
  const removeStock = usePortfolioStore((s) => s.removeStock);
  const addStock = usePortfolioStore((s) => s.addStock);
  const [query, setQuery] = useState("");
  const [newSymbol, setNewSymbol] = useState("");
  const [showShortlisted, setShowShortlisted] = useState(false);
  const [showActionable, setShowActionable] = useState(false);
  const [sort, setSort] = useState<SortKey>("symbol");
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_SORT_DIRECTION.symbol);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);
  const watchlistStocks = useMemo(() => stocks.filter((s) => s.quantity <= 0), [stocks]);

  function isActionable(action: string | undefined): boolean {
    if (!action) return false;
    const normalized = action.toUpperCase();
    return normalized === "BUY" || normalized === "ADD" || normalized === "SELL" || normalized === "REDUCE";
  }

  function recSymbolTextClass(action: string | undefined): string {
    const normalized = action?.toUpperCase() ?? "";
    if (normalized === "SELL") return "text-error dark:text-red-300";
    if (normalized === "REDUCE") return "text-amber-700 dark:text-amber-200";
    if (normalized === "BUY" || normalized === "ADD") return "text-primary dark:text-primary";
    return "text-foreground dark:text-white";
  }

  function toggleSort(next: SortKey) {
    if (sort === next) {
      setSortDirection((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSort(next);
    setSortDirection(DEFAULT_SORT_DIRECTION[next]);
  }

  const totalTrackedCount = watchlistStocks.length;

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    const filtered = watchlistStocks
      .filter((s) => {
        if (showShortlisted && !s.isShortlisted) return false;
        if (showActionable && !isActionable(s.recommendation?.action)) return false;
        if (!q) return true;
        return (
          s.symbol.includes(q) ||
          (s.name ?? "").toUpperCase().includes(q)
        );
      });

    filtered.sort((a, b) => {
      const analystA = Number.parseFloat(a.analystAvg ?? "");
      const analystB = Number.parseFloat(b.analystAvg ?? "");
      const upsideA = analystTargetUpsidePct(a.lastPrice, a.analystTarget);
      const upsideB = analystTargetUpsidePct(b.lastPrice, b.analystTarget);

      let cmp = 0;
      switch (sort) {
        case "symbol":
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case "lastPrice":
          cmp = (a.lastPrice ?? 0) - (b.lastPrice ?? 0);
          break;
        case "change":
          cmp = (a.dailyChangePercent ?? Number.NEGATIVE_INFINITY) - (b.dailyChangePercent ?? Number.NEGATIVE_INFINITY);
          break;
        case "analyst":
          cmp = (Number.isFinite(analystA) ? analystA : Number.NEGATIVE_INFINITY) - (Number.isFinite(analystB) ? analystB : Number.NEGATIVE_INFINITY);
          break;
        case "upside":
          cmp = (upsideA ?? Number.NEGATIVE_INFINITY) - (upsideB ?? Number.NEGATIVE_INFINITY);
          break;
        case "score":
          cmp = (a.score ?? Number.NEGATIVE_INFINITY) - (b.score ?? Number.NEGATIVE_INFINITY);
          break;
        case "signal":
          cmp = (a.recommendation?.action ?? "").localeCompare(b.recommendation?.action ?? "");
          break;
      }

      if (cmp === 0) return a.symbol.localeCompare(b.symbol);
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return filtered;
  }, [query, showActionable, showShortlisted, sort, sortDirection, watchlistStocks]);

  const hasActiveFilters = showShortlisted || showActionable || query.trim().length > 0;
  const watchlistCountText = hasActiveFilters ? `Showing ${rows.length} of ${totalTrackedCount}` : `Total: ${totalTrackedCount}`;

  function addWatchlistSymbol() {
    const sym = newSymbol.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
    if (!sym) return;
    addStock({ symbol: sym, quantity: 0, averageCost: 0, lastPrice: 0 });
    void flushCurrentPortfolioSnapshotNow(true);
    setNewSymbol("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-3">
        <CsvImportExportBar exportFilename="stocks-pm-watchlist.csv" importMode="watchlist" />
        <Link
          href="/csv-help"
          className="ui-hover-text self-center text-sm text-primary underline-offset-2 hover:underline"
        >
          CSV help
        </Link>
      </div>

      <div className="ui-hover-lift rounded-2xl border border-border bg-elevated p-3">
        <div className="grid items-end gap-3 lg:grid-cols-[minmax(12rem,1fr)_auto_minmax(14rem,1fr)]">
          <div className="min-w-[12rem] flex-1">
            <p className="text-lg font-semibold text-foreground">Watchlist</p>
            <p className="mt-1 text-xs text-subtle">{watchlistCountText}</p>
          </div>
          <div className="flex justify-center">
            <Link
              href="/simulation#watchlist-simulation"
              aria-label="Simulate (App Strategy)"
              title="Simulate (App Strategy)"
              className="group flex items-center"
            >
              <span className="relative flex h-11 w-44 items-center justify-center overflow-hidden rounded-[1.25rem] border border-primary/20 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--theme-primary)_16%,white),color-mix(in_srgb,var(--theme-primary)_6%,white)_44%,color-mix(in_srgb,var(--theme-primary)_18%,transparent))] shadow-[0_10px_24px_-18px_color-mix(in_srgb,var(--theme-primary)_65%,transparent)] transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-primary/32 hover:shadow-[0_16px_28px_-18px_color-mix(in_srgb,var(--theme-primary)_72%,transparent)] dark:border-primary/25 dark:bg-[linear-gradient(135deg,color-mix(in_srgb,var(--theme-primary)_22%,#0f1726),color-mix(in_srgb,var(--theme-primary)_10%,#111827)_46%,color-mix(in_srgb,var(--theme-primary)_20%,#0f1726))]">
                <span
                  className="pointer-events-none absolute inset-0 opacity-90"
                  aria-hidden
                  style={{
                    background:
                      "radial-gradient(circle at 14% 26%, color-mix(in srgb, var(--theme-primary) 24%, transparent), transparent 44%), radial-gradient(circle at 82% 74%, color-mix(in srgb, var(--theme-primary) 18%, transparent), transparent 48%), linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.18) 33%, transparent 60%)",
                  }}
                />
                <span className="relative text-primary/90 drop-shadow-[0_5px_14px_color-mix(in_srgb,var(--theme-primary)_28%,transparent)] dark:text-[color-mix(in_srgb,var(--theme-primary)_78%,white)]" aria-hidden>
                  <svg viewBox="0 0 176 44" className="h-11 w-44" fill="none">
                    <rect x="10" y="8" width="38" height="28" rx="10" fill="currentColor" fillOpacity="0.08" />
                    <rect x="10" y="8" width="38" height="28" rx="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.4" />
                    <path d="M17 29L24.5 22L29.5 25.5L38.5 15.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M34.5 15.5H38.5V19.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="24.5" cy="22" r="2.1" fill="currentColor" />
                    <circle cx="29.5" cy="25.5" r="2.1" fill="currentColor" fillOpacity="0.82" />
                    <circle cx="38.5" cy="15.5" r="2.1" fill="currentColor" />
                    <path d="M17 15.5H28" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.4" strokeLinecap="round" />
                    <path d="M17 19.5H22.5" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1.4" strokeLinecap="round" />
                    <text x="56" y="18" fill="currentColor" fontSize="8.4" fontWeight="700" letterSpacing="1.25">SIMULATE</text>
                    <text x="56" y="29.2" fill="currentColor" fillOpacity="0.92" fontSize="6.25" fontWeight="600" letterSpacing="0.9">APP STRATEGY</text>
                    <rect x="134" y="12" width="28" height="20" rx="10" fill="currentColor" fillOpacity="0.08" />
                    <rect x="134" y="12" width="28" height="20" rx="10" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.3" />
                    <path d="M143 22H153" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                    <path d="M149 17L154 22L149 27" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </span>
            </Link>
          </div>
          <div className="flex flex-wrap items-end justify-end gap-2">
            <label className="flex min-w-[9rem] flex-col gap-1 text-[11px] text-subtle">
              Add Stock
              <SymbolTradeCombobox
                id="watchlist-add-symbol"
                value={newSymbol}
                onChange={setNewSymbol}
                portfolioStocks={stocks}
              />
            </label>
            <button
              type="button"
              onClick={addWatchlistSymbol}
              className={appCtaButton("ui-hover-pop px-3 py-2 text-sm")}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="w-full overflow-x-auto rounded-2xl border border-border bg-elevated">
        <table className="w-full table-auto border-collapse text-sm md:table-fixed">
          <colgroup>
            <col className="w-[22%] md:w-[12%]" />
            <col className="w-[16%] md:hidden" />
            <col className="hidden md:table-column md:w-[10%]" />
            <col className="hidden md:table-column md:w-[10%]" />
            <col className="hidden md:table-column md:w-[10%]" />
            <col className="w-[10%] md:w-[10%]" />
            <col className="w-[14%] md:w-[10%]" />
            <col className="w-[10%] md:w-[12%]" />
            <col className="w-[18%] md:w-[12%]" />
            <col className="hidden md:table-column md:w-[6%]" />
          </colgroup>
          <thead className="bg-muted/60 text-xs font-semibold uppercase tracking-wide text-subtle dark:bg-white/[0.05]">
            <tr>
              <th scope="col" aria-sort={sort === "symbol" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"} className="px-2 py-3 text-center sm:px-3">
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleSort("symbol")}
                    className="inline-flex items-center justify-center gap-1 transition-colors hover:text-foreground"
                  >
                    <span>Symbol</span>
                    <span aria-hidden="true" className={`text-[10px] ${sort === "symbol" ? "text-foreground" : "text-subtle/70"}`}>
                      {sort === "symbol" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Type to filter"
                    className="w-full min-w-0 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium normal-case tracking-normal text-foreground placeholder:text-subtle"
                    aria-label="Filter watchlist symbols"
                  />
                </div>
              </th>
              <SortableHeaderCell
                label="Last / Chg"
                column="lastPrice"
                activeColumn={sort}
                direction={sortDirection}
                onSort={toggleSort}
                align="center"
                className="px-2 py-3 md:hidden"
              />
              <SortableHeaderCell label="Last" column="lastPrice" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden px-2 py-3 md:table-cell md:px-3" />
              <SortableHeaderCell label="Today %" column="change" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden px-2 py-3 md:table-cell md:px-3" />
              <SortableHeaderCell label="Analyst Rating" column="analyst" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden px-2 py-3 md:table-cell md:px-3" />
              <th scope="col" className="px-2 py-3 text-center sm:px-3">
                <div className="flex flex-col items-center gap-2">
                  <span>Shortlisted</span>
                  <button
                    type="button"
                    onClick={() => setShowShortlisted((value) => !value)}
                    className={columnFilterClass(showShortlisted, "amber")}
                  >
                    {showShortlisted ? "Showing Yes only" : "Filter Yes"}
                  </button>
                </div>
              </th>
              <SortableHeaderCell label="Potential Upside" column="upside" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="px-2 py-3 sm:px-3" />
              <SortableHeaderCell label="Score" column="score" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="px-2 py-3 sm:px-3" />
              <th scope="col" aria-sort={sort === "signal" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"} className="min-w-0 px-2 py-3 text-center sm:px-3">
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleSort("signal")}
                    className="inline-flex items-center justify-center gap-1 transition-colors hover:text-foreground"
                  >
                    <span>Recommendation</span>
                    <span aria-hidden="true" className={`text-[10px] ${sort === "signal" ? "text-foreground" : "text-subtle/70"}`}>
                      {sort === "signal" ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowActionable((value) => !value)}
                    className={columnFilterClass(showActionable, "emerald")}
                  >
                    {showActionable ? "Showing actionable" : "Filter actionable"}
                  </button>
                </div>
              </th>
              <th scope="col" className="hidden px-2 py-3 text-center md:table-cell md:px-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-subtle md:hidden">
                  No watchlist symbols yet. Add a symbol in the toolbar above or import a watchlist CSV.
                </td>
                <td colSpan={10} className="hidden px-4 py-8 text-center text-subtle md:table-cell sm:px-5">
                  No watchlist symbols yet. Add a symbol in the toolbar above or import a watchlist CSV.
                </td>
              </tr>
            ) : (
              rows.map((s) => {
                const upside = analystTargetUpsidePct(s.lastPrice, s.analystTarget);
                const rating = s.analystAvg?.trim();
                return (
                  <tr
                    key={s.symbol}
                    className="cursor-pointer transition-colors duration-150 hover:bg-muted/50 dark:hover:bg-white/[0.04]"
                    onClick={() => setDetailSymbol(s.symbol)}
                  >
                    <td className="min-w-0 px-2 py-3 align-middle font-medium text-foreground sm:px-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDetailSymbol(s.symbol);
                        }}
                        className={`ui-hover-text inline-flex max-w-full min-w-0 justify-center text-center hover:underline ${recSymbolTextClass(s.recommendation?.action)}`}
                      >
                        <span className="min-w-0 truncate">{s.symbol}</span>
                      </button>
                    </td>
                    <td className="px-2 py-3 text-center tabular-nums md:hidden">
                      <div className="flex min-w-[4.1rem] flex-col items-center leading-tight sm:min-w-[4.75rem]">
                        <span className="text-foreground">{formatCurrency(s.lastPrice ?? 0)}</span>
                        <span
                          className={
                            s.dailyChangePercent == null
                              ? "text-[11px] text-subtle"
                              : s.dailyChangePercent > 0
                                ? "text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
                                : s.dailyChangePercent < 0
                                  ? "text-[11px] font-medium text-red-700 dark:text-red-400"
                                  : "text-[11px] text-subtle"
                          }
                        >
                          {s.dailyChangePercent != null ? formatPercent(s.dailyChangePercent, true) : "—"}
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-2 py-3 text-center tabular-nums text-subtle md:table-cell md:px-3">{formatCurrency(s.lastPrice ?? 0)}</td>
                    <td
                      className={`hidden px-2 py-3 text-center tabular-nums font-medium md:table-cell md:px-3 ${
                        s.dailyChangePercent == null
                          ? "text-subtle"
                          : s.dailyChangePercent > 0
                            ? "text-emerald-700 dark:text-emerald-400"
                            : s.dailyChangePercent < 0
                              ? "text-red-700 dark:text-red-400"
                              : "text-subtle"
                      }`}
                    >
                      {s.dailyChangePercent != null ? formatPercent(s.dailyChangePercent, true) : "—"}
                    </td>
                    <td
                      className={`hidden min-w-0 px-2 py-3 text-center tabular-nums font-medium md:table-cell md:px-3 ${analystRatingTextClass(rating)}`}
                      title="Consensus / average rating when available from data refresh"
                    >
                      <span className="block truncate">{rating && !Number.isNaN(Number.parseFloat(rating)) ? formatDecimal(Number.parseFloat(rating)) : "—"}</span>
                    </td>
                    <td className="px-2 py-3 text-center font-medium text-subtle sm:px-3">
                      {s.isShortlisted ? "Yes" : "No"}
                    </td>
                    <td
                      className={`min-w-0 px-2 py-3 text-center tabular-nums font-medium sm:px-3 ${upsideTextClass(upside)}`}
                      title={
                        s.analystTarget != null && s.lastPrice
                          ? `Target ${formatCurrency(s.analystTarget)} vs last ${formatCurrency(s.lastPrice)}`
                          : undefined
                      }
                    >
                      <span className="block truncate">{formatUpsidePct(upside)}</span>
                    </td>
                    <td className={`min-w-0 px-2 py-3 text-center tabular-nums font-medium sm:px-3 ${scoreTextClass(s.score)}`}>
                      <span className="block truncate">{s.score != null ? formatDecimal(s.score) : "—"}</span>
                    </td>
                    <td className="min-w-0 px-2 py-3 text-center text-xs text-subtle sm:px-3">
                      {s.recommendation ? (
                        <span
                          className={`inline-flex max-w-full items-center justify-center truncate rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${recBadgeClass(s.recommendation.action)}`}
                          title={s.recommendation.comments || s.recommendation.action}
                        >
                          {recommendationActionDisplay(s.recommendation.action)}
                        </span>
                      ) : (
                        <span className="block truncate">—</span>
                      )}
                    </td>
                    <td className="hidden px-2 py-3 text-center md:table-cell md:px-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setRemoveTarget(s.symbol);
                        }}
                        className="ui-hover-text text-xs text-error hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={removeTarget != null}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (removeTarget) removeStock(removeTarget);
        }}
        title="Remove symbol?"
        description={
          removeTarget ? (
            <>
              Stop tracking <span className="font-medium text-foreground">{removeTarget}</span>? Holdings and history for this symbol disappear from the web view until you add it
              again.
            </>
          ) : null
        }
        confirmLabel="Remove"
        cancelLabel="Keep"
        variant="danger"
      />

      <StockDetailModal symbol={detailSymbol} onClose={() => setDetailSymbol(null)} />
    </div>
  );
}
