"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { appCtaButton } from "@/lib/appCtaClasses";
import { usePortfolioStore } from "@/store/portfolioStore";
import { runRefreshPipeline } from "@/lib/refresh";
import { analystTargetUpsidePct, formatMarketCapCompact, formatUpsidePct } from "@/lib/marketFormat";
import { CsvImportExportBar } from "@/components/portfolio/CsvImportExportBar";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

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
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  function isActionable(action: string | undefined): boolean {
    if (!action) return false;
    const normalized = action.toUpperCase();
    return normalized === "BUY" || normalized === "ADD" || normalized === "SELL" || normalized === "REDUCE";
  }

  const totalTrackedCount = stocks.length;

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    return stocks
      .filter((s) => {
        if (showShortlisted && !s.isShortlisted) return false;
        if (showActionable && !isActionable(s.recommendation?.action)) return false;
        if (!q) return true;
        return (
          s.symbol.includes(q) ||
          (s.name ?? "").toUpperCase().includes(q)
        );
      })
      .sort((a, b) => {
        const ah = a.quantity > 0 ? 0 : 1;
        const bh = b.quantity > 0 ? 0 : 1;
        if (ah !== bh) return ah - bh;
        return a.symbol.localeCompare(b.symbol);
      });
  }, [stocks, query, showActionable, showShortlisted]);

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

      <div className="ui-hover-lift rounded-2xl border border-border bg-elevated p-4">
        <h2 className="text-lg font-semibold text-foreground">Add to watchlist</h2>
        <p className="mt-1 text-sm text-subtle">
          New symbols start at 0 shares as watch-only rows. Buying shares from Portfolio still keeps them listed here.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addWatchlistSymbol()}
            placeholder="Symbol (e.g. AAPL)"
            className="min-w-[8rem] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground sm:max-w-xs"
          />
          <button
            type="button"
            onClick={addWatchlistSymbol}
            className={appCtaButton("ui-hover-pop px-4 py-2 text-sm")}
          >
            Add symbol
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setShowShortlisted((v) => !v)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
            showShortlisted
              ? "border-transparent bg-amber-300 text-black"
              : "border-border bg-elevated text-subtle hover:text-foreground"
          }`}
        >
          Shortlisted
        </button>
        <button
          type="button"
          onClick={() => setShowActionable((v) => !v)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
            showActionable
              ? "border-transparent bg-emerald-300 text-black"
              : "border-border bg-elevated text-subtle hover:text-foreground"
          }`}
        >
          Actionable
        </button>
        <input
          type="search"
          placeholder="Filter symbol…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-[10rem] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground sm:max-w-xs"
        />
      </div>

      <div className="w-full overflow-x-auto rounded-2xl border border-border bg-elevated">
        <table className="w-full min-w-[42rem] table-fixed border-collapse text-sm lg:min-w-full">
          <colgroup>
            {Array.from({ length: 8 }, (_, i) => (
              <col key={i} style={{ width: "12.5%" }} />
            ))}
          </colgroup>
          <thead className="text-xs font-semibold uppercase tracking-wide text-subtle">
            <tr>
              <th scope="col" className="px-2 py-3 pl-4 text-left sm:px-3 sm:pl-5">
                Symbol
              </th>
              <th scope="col" className="px-2 py-3 text-right tabular-nums sm:px-3">
                Last
              </th>
              <th scope="col" className="px-2 py-3 text-right tabular-nums sm:px-3">
                Change
              </th>
              <th scope="col" className="px-2 py-3 text-right tabular-nums sm:px-3">
                Analyst
              </th>
              <th scope="col" className="px-2 py-3 text-right tabular-nums sm:px-3">
                Upside
              </th>
              <th scope="col" className="px-2 py-3 text-right tabular-nums sm:px-3">
                Mkt cap
              </th>
              <th scope="col" className="min-w-0 px-2 py-3 text-left sm:px-3">
                Signal
              </th>
              <th scope="col" className="px-2 py-3 pr-4 text-right sm:px-3 sm:pr-5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-subtle sm:px-5">
                  No symbols yet. Add a symbol above, import CSV, or finish onboarding.
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
                    <td className="px-2 py-3 text-right tabular-nums text-subtle sm:px-3">${(s.lastPrice ?? 0).toFixed(2)}</td>
                    <td className="px-2 py-3 text-right tabular-nums text-subtle sm:px-3">
                      {s.dailyChangePercent != null ? `${s.dailyChangePercent >= 0 ? "+" : ""}${s.dailyChangePercent.toFixed(2)}%` : "—"}
                    </td>
                    <td
                      className="min-w-0 px-2 py-3 text-right tabular-nums text-foreground sm:px-3"
                      title="Consensus / average rating when available from data refresh"
                    >
                      <span className="block truncate">{rating || "—"}</span>
                    </td>
                    <td
                      className={`min-w-0 px-2 py-3 text-right tabular-nums font-medium sm:px-3 ${
                        upside == null ? "text-subtle" : upside > 0 ? "text-emerald-700 dark:text-emerald-400" : upside < 0 ? "text-red-700 dark:text-red-400" : "text-subtle"
                      }`}
                      title={
                        s.analystTarget != null && s.lastPrice
                          ? `Target $${s.analystTarget.toFixed(2)} vs last $${s.lastPrice.toFixed(2)}`
                          : undefined
                      }
                    >
                      <span className="block truncate">{formatUpsidePct(upside)}</span>
                    </td>
                    <td className="min-w-0 px-2 py-3 text-right tabular-nums text-subtle sm:px-3">
                      <span className="block truncate">{formatMarketCapCompact(s.marketCap)}</span>
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
