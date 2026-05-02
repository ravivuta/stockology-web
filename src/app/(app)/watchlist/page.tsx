"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { appCtaButton } from "@/lib/appCtaClasses";
import { usePortfolioStore } from "@/store/portfolioStore";
import { runRefreshPipeline } from "@/lib/refresh";
import { analystTargetUpsidePct, formatUpsidePct } from "@/lib/marketFormat";
import { formatCurrency, formatDecimal, formatPercent } from "@/lib/numberFormat";
import { CsvImportExportBar } from "@/components/portfolio/CsvImportExportBar";
import { SymbolTradeCombobox } from "@/components/portfolio/SymbolTradeCombobox";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SortableHeaderCell, type SortDirection } from "@/components/ui/SortableHeaderCell";

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

/**
 * Watchlist includes every tracked symbol: zero-qty names and all holdings (they stay on the watchlist automatically).
 */
export default function WatchlistPage() {
  const stocks = usePortfolioStore((s) => s.stocks);
  const recalc = usePortfolioStore((s) => s.recalcMetrics);
  const removeStock = usePortfolioStore((s) => s.removeStock);
  const addStock = usePortfolioStore((s) => s.addStock);
  const [query, setQuery] = useState("");
  const [newSymbol, setNewSymbol] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showShortlisted, setShowShortlisted] = useState(false);
  const [showActionable, setShowActionable] = useState(false);
  const [sort, setSort] = useState<SortKey>("symbol");
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_SORT_DIRECTION.symbol);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  function isActionable(action: string | undefined): boolean {
    if (!action) return false;
    const normalized = action.toUpperCase();
    return normalized === "BUY" || normalized === "ADD" || normalized === "SELL" || normalized === "REDUCE";
  }

  function toggleSort(next: SortKey) {
    if (sort === next) {
      setSortDirection((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSort(next);
    setSortDirection(DEFAULT_SORT_DIRECTION[next]);
  }

  const totalTrackedCount = stocks.length;

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    const filtered = stocks
      .filter((s) => {
        if (showShortlisted && (!s.isShortlisted || s.quantity > 0)) return false;
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
  }, [query, showActionable, showShortlisted, sort, sortDirection, stocks]);

  const hasActiveFilters = showShortlisted || showActionable || query.trim().length > 0;
  const watchlistCountText = hasActiveFilters ? `Showing ${rows.length} of ${totalTrackedCount}` : `Total: ${totalTrackedCount}`;

  async function refresh() {
    if (stocks.length === 0) return;
    setRefreshing(true);
    await runRefreshPipeline(stocks.map((s) => s.symbol));
    recalc();
    usePortfolioStore.setState({ lastRefreshAt: new Date().toISOString() });
    setRefreshing(false);
  }

  function addWatchlistSymbol() {
    const sym = newSymbol.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
    if (!sym) return;
    addStock({ symbol: sym, quantity: 0, averageCost: 0, lastPrice: 0 });
    setNewSymbol("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Watchlist</h1>
          <p className="mt-1 text-sm text-subtle">
            All symbols you track, including every holding. Positions with shares still appear here alongside watch-only names.
          </p>
          <p className="mt-2 text-xs text-subtle">{watchlistCountText}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            disabled={refreshing || stocks.length === 0}
            onClick={refresh}
            className={appCtaButton("ui-hover-spotlight px-4 py-2 text-sm disabled:opacity-50")}
          >
            {refreshing ? "Refreshing…" : "Refresh quotes"}
          </button>
          <CsvImportExportBar exportFilename="stocks-pm-watchlist.csv" />
          <Link href="/csv-help" className="ui-hover-text text-sm text-primary underline-offset-2 hover:underline">
            CSV help
          </Link>
        </div>
      </div>

      <div className="ui-hover-lift rounded-2xl border border-border bg-elevated p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[11px] text-subtle sm:max-w-xs">
            Filter
            <input
              type="search"
              placeholder="Filter symbol…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <button
            type="button"
            onClick={() => setShowShortlisted((v) => !v)}
            className={`rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
              showShortlisted
                ? "border-transparent bg-amber-300 text-black"
                : "border-border bg-background text-subtle hover:text-foreground"
            }`}
          >
            Show shortlisted
          </button>
          <button
            type="button"
            onClick={() => setShowActionable((v) => !v)}
            className={`rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
              showActionable
                ? "border-transparent bg-emerald-300 text-black"
                : "border-border bg-background text-subtle hover:text-foreground"
            }`}
          >
            Show actionable
          </button>
          <div className="hidden h-10 w-px self-end bg-border/80 dark:bg-white/[0.08] md:block" aria-hidden />
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <label className="flex min-w-[9rem] flex-col gap-1 text-[11px] text-subtle">
              Add symbol
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
            <col style={{ width: "14%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "8%" }} />
          </colgroup>
          <thead className="bg-muted/60 text-xs font-semibold uppercase tracking-wide text-subtle dark:bg-white/[0.05]">
            <tr>
              <SortableHeaderCell label="Symbol" column="symbol" activeColumn={sort} direction={sortDirection} onSort={toggleSort} className="px-2 py-3 pl-4 sm:px-3 sm:pl-5" />
              <SortableHeaderCell label="Last" column="lastPrice" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="right" className="px-2 py-3 sm:px-3" />
              <SortableHeaderCell label="Today %" column="change" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="right" className="px-2 py-3 sm:px-3" />
              <SortableHeaderCell label="Analyst Rating" column="analyst" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="right" className="px-2 py-3 sm:px-3" />
              <SortableHeaderCell label="Upside" column="upside" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="right" className="px-2 py-3 sm:px-3" />
              <SortableHeaderCell label="Score" column="score" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="right" className="px-2 py-3 sm:px-3" />
              <SortableHeaderCell label="Recommendation" column="signal" activeColumn={sort} direction={sortDirection} onSort={toggleSort} className="min-w-0 px-2 py-3 sm:px-3" />
              <th scope="col" className="px-2 py-3 pr-4 text-right sm:px-3 sm:pr-5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-subtle sm:px-5">
                  No symbols yet. Add a symbol in the toolbar above, import CSV, or finish onboarding.
                </td>
              </tr>
            ) : (
              rows.map((s) => {
                const upside = analystTargetUpsidePct(s.lastPrice, s.analystTarget);
                const rating = s.analystAvg?.trim();
                return (
                  <tr
                    key={s.symbol}
                    className="transition-colors duration-150 hover:bg-muted/50 dark:hover:bg-white/[0.04]"
                  >
                    <td className="min-w-0 px-2 py-3 pl-4 align-middle font-medium text-foreground sm:px-3 sm:pl-5">
                      <Link
                        href={`/stock/${encodeURIComponent(s.symbol)}`}
                        className="ui-hover-text inline-flex max-w-full min-w-0 text-left text-primary hover:underline"
                      >
                        <span className="min-w-0 truncate">{s.symbol}</span>
                      </Link>
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums text-subtle sm:px-3">{formatCurrency(s.lastPrice ?? 0)}</td>
                    <td className="px-2 py-3 text-right tabular-nums text-subtle sm:px-3">
                      {s.dailyChangePercent != null ? formatPercent(s.dailyChangePercent, true) : "—"}
                    </td>
                    <td
                      className="min-w-0 px-2 py-3 text-right tabular-nums text-foreground sm:px-3"
                      title="Consensus / average rating when available from data refresh"
                    >
                      <span className="block truncate">{rating && !Number.isNaN(Number.parseFloat(rating)) ? formatDecimal(Number.parseFloat(rating)) : "—"}</span>
                    </td>
                    <td
                      className={`min-w-0 px-2 py-3 text-right tabular-nums font-medium sm:px-3 ${
                        upside == null ? "text-subtle" : upside > 0 ? "text-emerald-700 dark:text-emerald-400" : upside < 0 ? "text-red-700 dark:text-red-400" : "text-subtle"
                      }`}
                      title={
                        s.analystTarget != null && s.lastPrice
                          ? `Target ${formatCurrency(s.analystTarget)} vs last ${formatCurrency(s.lastPrice)}`
                          : undefined
                      }
                    >
                      <span className="block truncate">{formatUpsidePct(upside)}</span>
                    </td>
                    <td className="min-w-0 px-2 py-3 text-right tabular-nums text-subtle sm:px-3">
                      <span className="block truncate">{s.score != null ? formatDecimal(s.score) : "—"}</span>
                    </td>
                    <td className="min-w-0 px-2 py-3 text-left text-xs text-subtle sm:px-3">
                      <span className="block truncate" title={s.recommendation?.action ?? undefined}>
                        {s.recommendation?.action ?? "—"}
                      </span>
                    </td>
                    <td className="px-2 py-3 pr-4 text-right sm:px-3 sm:pr-5">
                      <button
                        type="button"
                        onClick={() => setRemoveTarget(s.symbol)}
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
    </div>
  );
}
