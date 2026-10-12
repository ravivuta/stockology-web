"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePortfolioStore } from "@/store/portfolioStore";
import { recommendedWatchlistSize, dividendYieldPercent } from "@/lib/ios-recommendation";
import { analystTargetUpsidePct, formatUpsidePct } from "@/lib/marketFormat";
import { formatCurrency, formatDecimal, formatPercent } from "@/lib/numberFormat";
import { recommendationActionDisplay } from "@/lib/recommendation";
import { CsvImportExportBar } from "@/components/portfolio/CsvImportExportBar";
import { AddAssetButton } from "@/components/portfolio/AddAssetForm";
import { StockDetailModal } from "@/components/stock/StockDetailModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SortableHeaderCell, type SortDirection } from "@/components/ui/SortableHeaderCell";
import { fieldInputClass } from "@/lib/field-input";
import {
  flushCurrentPortfolioSnapshotNow,
  patchCurrentPortfolioSnapshotHoldings,
} from "@/lib/portfolio-snapshot-client";

type SortKey = "symbol" | "lastPrice" | "change" | "analyst" | "upside" | "yield" | "score" | "signal";

const DEFAULT_SORT_DIRECTION: Record<SortKey, SortDirection> = {
  symbol: "asc",
  lastPrice: "desc",
  change: "desc",
  analyst: "desc",
  upside: "desc",
  yield: "desc",
  score: "desc",
  signal: "asc",
};

function recBadgeClass(action: string): string {
  const u = action.toUpperCase();
  if (u === "SELL")
    return "bg-red-600/12 text-red-700 dark:bg-red-400/18 dark:text-red-200";
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
  if (upside > 50) return "text-emerald-600 dark:text-emerald-400";
  if (upside >= 25) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
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

function filterChipClass(active: boolean, tone: "green" | "gold") {
  const base = "no-ui-hover inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-tight";
  if (!active) return `${base} border-border bg-background text-foreground`;
  if (tone === "green") return `${base} border-transparent bg-emerald-500/90 text-black`;
  return `${base} border-transparent bg-[#f3c74a] text-black`;
}

/**
 * Watchlist page shows watch-only symbols. Active holdings stay on Portfolio.
 */
export default function WatchlistPage() {
  const stocks = usePortfolioStore((s) => s.stocks);
  const portfolioSize = usePortfolioStore((s) => s.portfolioSize);
  const limitWatchlistSize = usePortfolioStore((s) => s.limitWatchlistSize);
  const removeStock = usePortfolioStore((s) => s.removeStock);
  const [query, setQuery] = useState("");
  const [showShortlisted, setShowShortlisted] = useState(false);
  const [showActionable, setShowActionable] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("symbol");
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_SORT_DIRECTION.symbol);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);
  const watchlistStocks = useMemo(() => stocks.filter((s) => s.quantity <= 0), [stocks]);
  const shortlistedSymbolsForWatchlistFilter = useMemo(() => {
    const eligible = watchlistStocks.filter((s) => s.excludeFromShortlist !== true);

    if (!limitWatchlistSize) {
      return new Set(eligible.filter((s) => s.isShortlisted === true).map((s) => s.symbol));
    }

    const idealSize = recommendedWatchlistSize(portfolioSize);
    const etfSymbols = new Set(eligible.filter((s) => s.isETF === true).map((s) => s.symbol));
    const stockSlots = idealSize;

    const topStockSymbols = new Set(
      eligible
        .filter((s) => s.isETF !== true)
        .sort((a, b) => {
          const lhs = a.score ?? 0;
          const rhs = b.score ?? 0;
          if (lhs === rhs) return a.symbol.localeCompare(b.symbol);
          return rhs - lhs;
        })
        .slice(0, stockSlots)
        .map((s) => s.symbol)
    );

    return new Set([...etfSymbols, ...topStockSymbols]);
  }, [limitWatchlistSize, portfolioSize, watchlistStocks]);

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
        if (showShortlisted && !shortlistedSymbolsForWatchlistFilter.has(s.symbol)) return false;
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
        case "yield": {
          const yieldA = a.dividendYield != null && a.dividendYield > 0 ? dividendYieldPercent(a.dividendYield) : Number.NEGATIVE_INFINITY;
          const yieldB = b.dividendYield != null && b.dividendYield > 0 ? dividendYieldPercent(b.dividendYield) : Number.NEGATIVE_INFINITY;
          cmp = yieldA - yieldB;
          break;
        }
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
  }, [query, shortlistedSymbolsForWatchlistFilter, showActionable, showShortlisted, sort, sortDirection, watchlistStocks]);

  async function persistWatchlistRemoval(symbol: string) {
    setRemoveError(null);
    const saved = await flushCurrentPortfolioSnapshotNow(true, { allowEmptyHoldings: true });
    if (!saved.error && !saved.skipped) return;
    const patched = await patchCurrentPortfolioSnapshotHoldings([symbol]);
    if (!patched.error && patched.patched) return;
    setRemoveError(
      saved.error?.message ??
        patched.error?.message ??
        `${symbol} was removed on this device, but the snapshot was not updated.`
    );
  }

  const hasActiveFilters = showShortlisted || showActionable || query.trim().length > 0;
  const watchlistCountText = hasActiveFilters ? `Showing ${rows.length} of ${totalTrackedCount}` : `Total: ${totalTrackedCount}`;

  return (
    <div className="space-y-6">
      {removeError ? <p className="text-sm text-error">{removeError}</p> : null}
      <div className="flex flex-wrap justify-end gap-3">
        <CsvImportExportBar exportFilename="stocks-pm-watchlist.csv" importMode="watchlist" />
        <Link
          href="/csv-help"
          className="ui-hover-text self-center text-sm text-primary underline-offset-2 hover:underline"
        >
          CSV help
        </Link>
      </div>

      <div className="ui-hover-lift rounded-2xl border border-border bg-elevated px-3 py-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {limitWatchlistSize ? (
            <button
              type="button"
              onClick={() => setShowShortlisted((value) => !value)}
              className={filterChipClass(showShortlisted, "gold")}
              aria-pressed={showShortlisted}
            >
              Shortlisted
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setShowActionable((value) => !value)}
            className={filterChipClass(showActionable, "green")}
            aria-pressed={showActionable}
          >
            Actionable
          </button>
          <AddAssetButton idPrefix="watchlist-add" />
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className={`${filterChipClass(false, "gold")} ${searchOpen ? "pointer-events-none invisible" : ""}`}
            aria-hidden={searchOpen}
            tabIndex={searchOpen ? -1 : 0}
          >
            Search
          </button>
          <p className="ml-auto shrink-0 text-xs text-subtle">{watchlistCountText}</p>
        </div>
        {searchOpen ? (
          <div className="mt-2 flex justify-end">
            <input
              type="search"
              value={query}
              onChange={(event) => {
                const next = event.target.value;
                setQuery(next);
                if (!next) setSearchOpen(false);
              }}
              placeholder="Filter"
              className={`${fieldInputClass} w-40 rounded-lg px-3 py-1.5 text-sm`}
              aria-label="Filter watchlist symbols"
              autoFocus
            />
          </div>
        ) : null}
      </div>

      <div className="w-full overflow-x-auto rounded-2xl border border-border bg-elevated">
        <table className="w-full table-auto border-collapse text-xs sm:text-sm md:table-fixed">
          <colgroup>
            <col className="w-[24%] md:w-[12%]" />
            <col className="w-[20%] md:hidden" />
            <col className="hidden md:table-column md:w-[10%]" />
            <col className="hidden md:table-column md:w-[10%]" />
            <col className="hidden md:table-column md:w-[10%]" />
            <col className="hidden sm:table-column sm:w-[10%] md:w-[10%]" />
            <col className="w-[18%] md:w-[9%]" />
            <col className="w-[14%] sm:w-[8%] md:w-[8%]" />
            <col className="hidden sm:table-column sm:w-[10%] md:w-[10%]" />
            <col className="w-[34%] sm:w-[18%] md:w-[12%]" />
            <col className="hidden md:table-column md:w-[6%]" />
          </colgroup>
          <thead className="border-b border-zinc-400/70 bg-zinc-300/95 text-xs font-semibold uppercase tracking-wide text-subtle dark:border-zinc-600 dark:bg-zinc-700/85">
            <tr>
              <SortableHeaderCell label="Symbol" column="symbol" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="px-1.5 py-2.5 sm:px-3 sm:py-3" />
              <SortableHeaderCell
                label="Last / Chg"
                column="lastPrice"
                activeColumn={sort}
                direction={sortDirection}
                onSort={toggleSort}
                align="center"
                className="px-1.5 py-2.5 md:hidden"
              />
              <SortableHeaderCell label="Last" column="lastPrice" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden px-2 py-3 md:table-cell md:px-3" />
              <SortableHeaderCell label="Today %" column="change" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden px-2 py-3 md:table-cell md:px-3" />
              <SortableHeaderCell label="Analyst Rating" column="analyst" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden px-2 py-3 md:table-cell md:px-3" />
              <th scope="col" className="hidden px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide sm:table-cell sm:px-3">
                Shortlisted
              </th>
              <SortableHeaderCell label="Potential Upside" column="upside" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="px-1.5 py-2.5 sm:px-3 sm:py-3" />
              <SortableHeaderCell label="Div%" column="yield" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="px-1 py-2.5 sm:px-2 sm:py-3" />
              <SortableHeaderCell label="Score" column="score" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden px-2 py-3 sm:table-cell sm:px-3" />
              <SortableHeaderCell label="Rec" column="signal" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="min-w-0 px-1.5 py-2.5 sm:hidden" />
              <SortableHeaderCell label="Recommendation" column="signal" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden min-w-0 px-3 py-3 sm:table-cell" />
              <th scope="col" className="hidden px-2 py-3 text-center md:table-cell md:px-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-subtle md:hidden">
                  No watchlist symbols yet. Add a symbol in the toolbar above or import a watchlist CSV.
                </td>
                <td colSpan={11} className="hidden px-4 py-8 text-center text-subtle md:table-cell sm:px-5">
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
                    <td className="min-w-0 px-1.5 py-2.5 align-middle font-medium text-foreground sm:px-3 sm:py-3">
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
                    <td className="px-1.5 py-2.5 text-center tabular-nums md:hidden">
                      <div className="flex min-w-[4.1rem] flex-col items-center leading-tight sm:min-w-[4.75rem]">
                        <span className="text-foreground">{formatDecimal(s.lastPrice ?? 0)}</span>
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
                    <td className="hidden px-2 py-3 text-center tabular-nums text-subtle md:table-cell md:px-3">{formatDecimal(s.lastPrice ?? 0)}</td>
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
                    <td className="hidden px-2 py-3 text-center font-medium text-subtle sm:table-cell sm:px-3">
                      {s.isShortlisted ? "Yes" : "No"}
                    </td>
                    <td
                      className={`min-w-0 px-1.5 py-2.5 text-center tabular-nums font-medium sm:px-3 sm:py-3 ${upsideTextClass(upside)}`}
                      title={
                        s.analystTarget != null && s.lastPrice
                          ? `Target ${formatCurrency(s.analystTarget)} vs last ${formatCurrency(s.lastPrice)}`
                          : undefined
                      }
                    >
                      <span className="block truncate">{formatUpsidePct(upside)}</span>
                    </td>
                    <td className="min-w-0 px-1 py-2.5 text-center tabular-nums font-medium text-foreground sm:px-2 sm:py-3">
                      <span className="block truncate">
                        {s.dividendYield != null && s.dividendYield > 0
                          ? `${dividendYieldPercent(s.dividendYield).toFixed(1)}%`
                          : "—"}
                      </span>
                    </td>
                    <td className={`hidden min-w-0 px-2 py-3 text-center tabular-nums font-medium sm:table-cell sm:px-3 ${scoreTextClass(s.score)}`}>
                      <span className="block truncate text-center">{s.score != null ? formatDecimal(s.score) : "—"}</span>
                    </td>
                    <td className="min-w-0 px-1.5 py-2.5 text-center text-xs text-subtle sm:px-3 sm:py-3">
                      {s.recommendation ? (
                        <span
                          className={`inline-flex max-w-full items-center justify-center truncate rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide sm:px-2 sm:text-[11px] ${recBadgeClass(s.recommendation.action)}`}
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
          if (!removeTarget) return;
          const sym = removeTarget.toUpperCase();
          removeStock(sym);
          void persistWatchlistRemoval(sym);
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
