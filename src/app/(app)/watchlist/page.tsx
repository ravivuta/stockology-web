"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
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
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_auto] lg:items-start">
        <Link
          href="/simulation#watchlist-simulation"
          className="group relative overflow-hidden rounded-[1.35rem] border border-primary/20 bg-[linear-gradient(135deg,rgba(182,153,62,0.16),rgba(255,255,255,0.88)_42%,rgba(244,211,94,0.16))] p-4 shadow-sm transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md dark:border-primary/25 dark:bg-[linear-gradient(135deg,rgba(182,153,62,0.22),rgba(18,24,38,0.95)_40%,rgba(244,211,94,0.12))]"
        >
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-[42%] opacity-80"
            aria-hidden
            style={{
              background:
                "radial-gradient(circle at 35% 40%, color-mix(in srgb, var(--theme-primary) 30%, transparent), transparent 52%), radial-gradient(circle at 70% 70%, color-mix(in srgb, #f3c74a 22%, transparent), transparent 58%)",
            }}
          />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary dark:border-primary/25 dark:bg-primary/14">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Simulation
              </div>
              <div className="mt-3">
                <p className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">Simulate (App Strategy)</p>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-subtle">
                  Run the watchlist through the same app strategy logic and inspect which names the shortlist would favor.
                </p>
              </div>
              <div className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-foreground">
                Open simulator
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </div>
            </div>
            <div className="relative flex h-28 w-full max-w-[16rem] items-end justify-between overflow-hidden rounded-2xl border border-border/70 bg-background/70 px-3 py-3 shadow-inner dark:border-white/[0.08] dark:bg-white/[0.04] sm:h-32 sm:w-[15rem]">
              <div className="absolute inset-x-3 bottom-3 top-3">
                <div className="absolute inset-0 rounded-xl bg-[linear-gradient(180deg,transparent,rgba(243,199,74,0.08))]" />
                <div className="absolute inset-x-0 bottom-3 border-t border-dashed border-primary/20" />
              </div>
              <div className="relative flex w-full items-end justify-between gap-2">
                {[
                  "h-[32%]",
                  "h-[46%]",
                  "h-[38%]",
                  "h-[62%]",
                  "h-[78%]",
                ].map((height, index) => (
                  <div
                    key={index}
                    className={`flex-1 rounded-t-full bg-[linear-gradient(180deg,rgba(243,199,74,0.92),rgba(183,150,63,0.42))] ${height}`}
                  />
                ))}
              </div>
              <div className="absolute left-3 right-3 top-3 flex items-center justify-between">
                <div
                  className="flex h-9 w-9 items-center justify-center text-primary/90 drop-shadow-[0_4px_14px_rgba(182,153,62,0.28)]"
                  aria-hidden
                >
                  <svg viewBox="0 0 40 40" className="h-9 w-9" fill="none">
                    <circle cx="20" cy="20" r="16" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
                    <path
                      d="M10 24.5C13.5 19.5 18 17 22 17C25.2 17 28 18.4 30.5 21"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                    <path
                      d="M11.5 13.5L16.2 18.2L22.2 12.1L28.5 18.4"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="11.5" cy="13.5" r="2.2" fill="currentColor" />
                    <circle cx="22.2" cy="12.1" r="2.2" fill="currentColor" />
                    <circle cx="30.5" cy="21" r="2.2" fill="currentColor" />
                  </svg>
                </div>
                <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                  App
                </div>
              </div>
            </div>
          </div>
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
          <Link
            href="/csv-help"
            className="ui-hover-text text-sm text-primary underline-offset-2 hover:underline lg:order-2"
          >
            CSV help
          </Link>
          <CsvImportExportBar exportFilename="stocks-pm-watchlist.csv" importMode="watchlist" />
        </div>
      </div>

      <div className="ui-hover-lift rounded-2xl border border-border bg-elevated p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <p className="text-lg font-semibold text-foreground">Watchlist</p>
            <p className="mt-1 text-xs text-subtle">{watchlistCountText}</p>
          </div>
          <div className="ml-auto flex flex-wrap items-end gap-2">
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
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col style={{ width: "12%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "6%" }} />
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
              <SortableHeaderCell label="Last" column="lastPrice" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="px-2 py-3 sm:px-3" />
              <SortableHeaderCell label="Today %" column="change" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="px-2 py-3 sm:px-3" />
              <SortableHeaderCell label="Analyst Rating" column="analyst" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="px-2 py-3 sm:px-3" />
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
              <th scope="col" className="px-2 py-3 text-center sm:px-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-subtle sm:px-5">
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
                    <td className="px-2 py-3 text-center tabular-nums text-subtle sm:px-3">{formatCurrency(s.lastPrice ?? 0)}</td>
                    <td
                      className={`px-2 py-3 text-center tabular-nums font-medium sm:px-3 ${
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
                      className={`min-w-0 px-2 py-3 text-center tabular-nums font-medium sm:px-3 ${analystRatingTextClass(rating)}`}
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
                    <td className="px-2 py-3 text-center sm:px-3">
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
