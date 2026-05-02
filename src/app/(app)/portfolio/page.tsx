"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { appCtaButton, glassFilterToggle } from "@/lib/appCtaClasses";
import { usePortfolioStore } from "@/store/portfolioStore";
import { runRefreshPipeline } from "@/lib/refresh";
import { analystTargetUpsidePct, formatUpsidePct } from "@/lib/marketFormat";
import { CsvImportExportBar } from "@/components/portfolio/CsvImportExportBar";
import { PortfolioAllocationChart } from "@/components/portfolio/PortfolioAllocationChart";
import { SymbolTradeCombobox } from "@/components/portfolio/SymbolTradeCombobox";
import { SortableHeaderCell, type SortDirection } from "@/components/ui/SortableHeaderCell";
import { isValidTicker } from "@/lib/csvPortfolio";
import { formatCurrency, formatDecimal, formatNumberMax2, formatPercent, formatSignedCurrency, formatWholeCurrency } from "@/lib/numberFormat";
import { recommendationActionDisplay } from "@/lib/recommendation";
import { computeTodayChangeFromLiveQuotes } from "@/lib/portfolio-net-worth-series";

type SortKey = "symbol" | "quantity" | "averageCost" | "costBasis" | "lastPrice" | "value" | "gainLoss" | "upside" | "score" | "today" | "signal";

const DEFAULT_SORT_DIRECTION: Record<SortKey, SortDirection> = {
  symbol: "asc",
  quantity: "desc",
  averageCost: "desc",
  costBasis: "desc",
  lastPrice: "desc",
  value: "desc",
  gainLoss: "desc",
  upside: "desc",
  score: "desc",
  today: "desc",
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

function recSymbolTextClass(action: string | undefined): string {
  const u = action?.toUpperCase() ?? "";
  if (u === "SELL") return "text-error dark:text-red-300";
  if (u === "REDUCE") return "text-amber-700 dark:text-amber-200";
  if (u === "BUY" || u === "ADD") return "text-primary dark:text-primary";
  return "text-foreground dark:text-white";
}

function PortfolioSummaryTiles({
  cash,
  assetsValue,
  netWorth,
  totalGainLoss,
  totalGainLossPct,
  portfolioTodayChange,
}: {
  cash: number;
  assetsValue: number;
  netWorth: number;
  totalGainLoss: number;
  totalGainLossPct: number | null;
  portfolioTodayChange: { change: number; percent: number; hasBaseline: boolean };
}) {
  return (
    <>
      <div className="rounded-xl border border-border/80 bg-elevated px-4 py-3 shadow-sm dark:border-white/[0.08]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">Cash balance</p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatCurrency(cash)}</p>
      </div>
      <div className="rounded-xl border border-border/80 bg-elevated px-4 py-3 shadow-sm dark:border-white/[0.08]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">Assets value</p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatCurrency(assetsValue)}</p>
        <p className="mt-0.5 text-[11px] text-subtle">Holdings at last price</p>
      </div>
      <div className="rounded-xl border border-border/80 bg-elevated px-4 py-3 shadow-sm dark:border-white/[0.08]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">Net worth</p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatCurrency(netWorth)}</p>
        <p className="mt-0.5 text-[11px] text-subtle">Cash + assets</p>
      </div>
      <div className="rounded-xl border border-border/80 bg-elevated px-4 py-3 shadow-sm dark:border-white/[0.08]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">Total gain</p>
        <p
          className={`mt-1 text-lg font-semibold tabular-nums ${
            totalGainLoss > 0
              ? "text-emerald-600 dark:text-primary"
              : totalGainLoss < 0
                ? "text-red-600 dark:text-red-400"
                : "text-foreground"
          }`}
        >
          {formatSignedCurrency(totalGainLoss)}
          {totalGainLossPct != null ? ` (${formatPercent(totalGainLossPct, true)})` : ""}
        </p>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">Today&apos;s chg</p>
        {portfolioTodayChange.hasBaseline ? (
          <p
            className={`mt-1 text-sm font-medium tabular-nums ${
              portfolioTodayChange.change > 0
                ? "text-emerald-600 dark:text-primary"
                : portfolioTodayChange.change < 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-foreground"
            }`}
          >
            {formatSignedCurrency(portfolioTodayChange.change)} ({formatPercent(portfolioTodayChange.percent, true)})
          </p>
        ) : (
          <p className="mt-1 text-sm font-medium tabular-nums text-subtle">—</p>
        )}
      </div>
    </>
  );
}

export default function PortfolioPage() {
  const stocks = usePortfolioStore((s) => s.stocks);
  const cash = usePortfolioStore((s) => s.cashBalance);
  const recalc = usePortfolioStore((s) => s.recalcMetrics);
  const addStock = usePortfolioStore((s) => s.addStock);
  const updateStock = usePortfolioStore((s) => s.updateStock);

  const [sort, setSort] = useState<SortKey>("symbol");
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_SORT_DIRECTION.symbol);
  const [query, setQuery] = useState("");
  const [showActionable, setShowActionable] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [newQuantity, setNewQuantity] = useState("1");
  const [newAverageCost, setNewAverageCost] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);

  /** Portfolio page lists positions only; watchlist-only symbols (0 qty) stay in store for trading elsewhere. */
  const holdings = useMemo(() => stocks.filter((s) => s.quantity > 0), [stocks]);

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

  const rows = useMemo(() => {
    let r = [...holdings];
    const q = query.trim().toUpperCase();
    if (showActionable) r = r.filter((s) => isActionable(s.recommendation?.action));
    if (q) r = r.filter((s) => s.symbol.includes(q));
    r.sort((a, b) => {
      const valueA = a.quantity * (a.lastPrice ?? 0);
      const valueB = b.quantity * (b.lastPrice ?? 0);
      const costBasisA = a.quantity * a.averageCost;
      const costBasisB = b.quantity * b.averageCost;
      const gainLossA = valueA - costBasisA;
      const gainLossB = valueB - costBasisB;
      const upsideA = analystTargetUpsidePct(a.lastPrice, a.analystTarget);
      const upsideB = analystTargetUpsidePct(b.lastPrice, b.analystTarget);
      const todayA = a.dailyChangePercent ?? Number.NEGATIVE_INFINITY;
      const todayB = b.dailyChangePercent ?? Number.NEGATIVE_INFINITY;

      let cmp = 0;
      switch (sort) {
        case "symbol":
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case "quantity":
          cmp = a.quantity - b.quantity;
          break;
        case "averageCost":
          cmp = a.averageCost - b.averageCost;
          break;
        case "costBasis":
          cmp = costBasisA - costBasisB;
          break;
        case "lastPrice":
          cmp = (a.lastPrice ?? 0) - (b.lastPrice ?? 0);
          break;
        case "value":
          cmp = valueA - valueB;
          break;
        case "gainLoss":
          cmp = gainLossA - gainLossB;
          break;
        case "upside":
          cmp = (upsideA ?? Number.NEGATIVE_INFINITY) - (upsideB ?? Number.NEGATIVE_INFINITY);
          break;
        case "score":
          cmp = (a.score ?? Number.NEGATIVE_INFINITY) - (b.score ?? Number.NEGATIVE_INFINITY);
          break;
        case "today":
          cmp = todayA - todayB;
          break;
        case "signal":
          cmp = (a.recommendation?.action ?? "").localeCompare(b.recommendation?.action ?? "");
          break;
      }

      if (cmp === 0) return a.symbol.localeCompare(b.symbol);
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return r;
  }, [holdings, query, showActionable, sort, sortDirection]);

  const { assetsValue, totalGainLoss, totalGainLossPct, netWorth, portfolioTodayChange } = useMemo(() => {
    const assets = stocks.reduce((a, s) => a + s.quantity * (s.lastPrice ?? 0), 0);
    const holdingsCostBasis = stocks.reduce((a, s) => a + s.quantity * s.averageCost, 0);
    const totalGainLoss = assets - holdingsCostBasis;
    const totalGainLossPct = holdingsCostBasis > 0 ? (totalGainLoss / holdingsCostBasis) * 100 : null;
    const net = assets + cash;
    const portfolioTodayChange = computeTodayChangeFromLiveQuotes(stocks, cash);
    return { assetsValue: assets, holdingsCostBasis, totalGainLoss, totalGainLossPct, netWorth: net, portfolioTodayChange };
  }, [stocks, cash]);

  async function refresh() {
    if (stocks.length === 0) return;
    setRefreshing(true);
    await runRefreshPipeline(stocks.map((s) => s.symbol));
    recalc();
    usePortfolioStore.setState({ lastRefreshAt: new Date().toISOString() });
    setRefreshing(false);
  }

  function addHolding() {
    const sym = newSymbol.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
    const quantity = parseFloat(newQuantity);
    const averageCost = parseFloat(newAverageCost);
    if (!isValidTicker(sym) || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(averageCost) || averageCost <= 0) return;

    const existing = stocks.find((s) => s.symbol === sym);
    const nextLastPrice = existing?.lastPrice && existing.lastPrice > 0 ? existing.lastPrice : averageCost;
    if (existing) {
      updateStock(sym, {
        quantity,
        averageCost,
        lastPrice: nextLastPrice,
        pendingOptimization: existing.pendingOptimization ?? true,
      });
    } else {
      addStock({
        symbol: sym,
        quantity,
        averageCost,
        lastPrice: nextLastPrice,
        pendingOptimization: true,
      });
    }

    setNewSymbol("");
    setNewQuantity("1");
    setNewAverageCost("");
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Portfolio</h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={refreshing || stocks.length === 0}
            onClick={refresh}
            className={appCtaButton("ui-hover-spotlight px-4 py-2 text-sm disabled:opacity-50")}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <CsvImportExportBar exportFilename="stocks-pm-portfolio.csv" compact importMode="portfolio" />
          <Link href="/csv-help" className="ui-hover-pop rounded-lg border border-primary/30 px-3 py-2 text-sm text-foreground dark:border-primary/25">
            CSV help
          </Link>
        </div>
      </div>

      <div className="hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-4">
        <PortfolioSummaryTiles
          cash={cash}
          assetsValue={assetsValue}
          netWorth={netWorth}
          totalGainLoss={totalGainLoss}
          totalGainLossPct={totalGainLossPct}
          portfolioTodayChange={portfolioTodayChange}
        />
      </div>

      <div className="space-y-8">
        <div className="ui-hover-lift rounded-2xl border border-border bg-elevated p-3">
            <div className="md:hidden">
              <button
                type="button"
                aria-expanded={mobileControlsOpen}
                aria-controls="portfolio-mobile-controls"
                onClick={() => setMobileControlsOpen((open) => !open)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
              >
                {mobileControlsOpen ? "Hide filters & add stock" : "Show filters & add stock"}
              </button>
            </div>
            <div id="portfolio-mobile-controls" className={`${mobileControlsOpen ? "mt-3 flex" : "hidden"} flex-wrap items-end gap-2 md:mt-0 md:flex`}>
              <label className="flex min-w-[11rem] flex-1 flex-col gap-1 text-[11px] text-subtle sm:max-w-xs">
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
                onClick={() => setShowActionable((v) => !v)}
                className={glassFilterToggle(showActionable, "emerald")}
              >
                Show actionable stocks
              </button>
              <div className="hidden h-10 w-px self-end bg-border/80 dark:bg-white/[0.08] md:block" aria-hidden />
              <div className="grid min-w-[18rem] flex-1 items-end gap-2 sm:grid-cols-[minmax(11rem,1.5fr)_7.5rem_6.5rem_auto]">
                <label className="flex min-w-0 flex-col gap-1 text-[11px] text-subtle">
                  Add New Stock/Holding
                  <SymbolTradeCombobox
                    id="portfolio-add-holding-symbol"
                    value={newSymbol}
                    onChange={setNewSymbol}
                    portfolioStocks={stocks}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-[11px] text-subtle">
                  Avg cost
                  <input
                    value={newAverageCost}
                    onChange={(e) => setNewAverageCost(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addHolding()}
                    placeholder="100"
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-[11px] text-subtle">
                  Qty
                  <input
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addHolding()}
                    placeholder="1"
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                </label>
                <button
                  type="button"
                  onClick={addHolding}
                  className={appCtaButton("ui-hover-pop px-3 py-2 text-sm")}
                >
                  Add
                </button>
              </div>
            </div>
        </div>

        <div className="ui-hover-lift overflow-x-auto rounded-2xl border border-border bg-elevated">
            <table className="min-w-[1180px] w-full text-sm">
              <colgroup>
                <col style={{ width: "13%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "6%" }} />
                <col style={{ width: "9%" }} />
              </colgroup>
              <thead className="bg-muted/60 text-subtle dark:bg-white/[0.05]">
                <tr>
                  <SortableHeaderCell label="Symbol" column="symbol" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" />
                  <SortableHeaderCell label="Last" column="lastPrice" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" />
                  <SortableHeaderCell label="Chg" column="today" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" />
                  <SortableHeaderCell label="Qty" column="quantity" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" />
                  <SortableHeaderCell label="Avg" column="averageCost" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" />
                  <SortableHeaderCell label="Costbasis" column="costBasis" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" />
                  <SortableHeaderCell label="Current Value" column="value" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" />
                  <SortableHeaderCell label="P/L" column="gainLoss" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" />
                  <SortableHeaderCell label="Upside" column="upside" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" />
                  <SortableHeaderCell label="Score" column="score" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" />
                  <SortableHeaderCell label="Recommendation" column="signal" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" />
                </tr>
              </thead>
              <tbody>
                {rows.flatMap((s) => {
                  const value = s.quantity * (s.lastPrice ?? 0);
                  const costBasis = s.quantity * s.averageCost;
                  const gainLoss = value - costBasis;
                  const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : null;
                  const upside = analystTargetUpsidePct(s.lastPrice, s.analystTarget);
                  const d = s.dailyChangePercent;
                  return (
                    <tr
                      key={s.symbol}
                      className="transition-colors duration-150 hover:bg-muted/50 dark:hover:bg-white/[0.04]"
                    >
                      <td className="px-4 py-3 align-middle text-center">
                        <div className="min-w-0">
                          <Link
                            href={`/stock/${encodeURIComponent(s.symbol)}`}
                            className={`ui-hover-text inline-flex max-w-full items-center justify-center gap-1 truncate font-medium hover:underline ${recSymbolTextClass(s.recommendation?.action)}`}
                          >
                            {s.symbol}
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-foreground">{formatCurrency(s.lastPrice ?? 0)}</td>
                      <td
                        className={`px-4 py-3 text-center tabular-nums font-medium ${
                          d == null ? "text-subtle" : d > 0 ? "text-emerald-700 dark:text-primary" : d < 0 ? "text-red-700 dark:text-red-400" : "text-subtle"
                        }`}
                      >
                        {d != null && Number.isFinite(d) ? formatPercent(d, true) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-foreground">{formatNumberMax2(s.quantity)}</td>
                      <td className="px-4 py-3 text-center tabular-nums text-foreground">{formatCurrency(s.averageCost)}</td>
                      <td className="px-4 py-3 text-center tabular-nums text-foreground">{formatWholeCurrency(costBasis)}</td>
                      <td className="px-4 py-3 text-center tabular-nums text-foreground">{formatWholeCurrency(value)}</td>
                      <td
                        className={`px-4 py-3 text-center tabular-nums font-medium ${
                          gainLoss > 0
                            ? "text-emerald-700 dark:text-primary"
                            : gainLoss < 0
                              ? "text-red-700 dark:text-red-400"
                              : "text-subtle"
                        }`}
                      >
                        {formatWholeCurrency(Math.abs(gainLoss))}
                        {gainLossPct != null ? ` (${formatPercent(gainLossPct, true)})` : ""}
                      </td>
                      <td className={`px-4 py-3 text-center tabular-nums font-medium ${upside == null ? "text-subtle" : upside > 0 ? "text-emerald-700 dark:text-primary" : upside < 0 ? "text-red-700 dark:text-red-400" : "text-subtle"}`}>
                        {formatUpsidePct(upside)}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-foreground">{s.score != null ? formatDecimal(s.score) : "—"}</td>
                      <td className="px-4 py-3 align-middle text-center">
                        {s.recommendation ? (
                          <span
                            className={`inline-flex max-w-full items-center justify-center truncate rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${recBadgeClass(s.recommendation.action)}`}
                            title={s.recommendation.comments || s.recommendation.action}
                          >
                            {recommendationActionDisplay(s.recommendation.action)}
                          </span>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="p-6 text-center text-subtle">
                {holdings.length === 0
                  ? "You don’t have any holdings yet. Add a holding above or import positions from CSV."
                  : "No holdings match your search."}
              </p>
            )}
        </div>

        <section className="ui-hover-lift hidden rounded-2xl border border-border bg-elevated p-4 sm:p-5 md:block">
          <h2 className="text-lg font-semibold text-foreground">Portfolio allocation</h2>
          <p className="mt-1 text-sm text-subtle">
            Market value by position and cash (largest slices first). Smaller positions may be grouped as Other.
          </p>
          <div className="mt-4">
            <PortfolioAllocationChart stocks={stocks} cash={cash} />
          </div>
        </section>
      </div>
    </div>
  );
}
