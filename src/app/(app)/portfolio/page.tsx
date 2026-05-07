"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Pencil, X } from "lucide-react";
import { appCtaButton } from "@/lib/appCtaClasses";
import { usePortfolioStore } from "@/store/portfolioStore";
import { analystTargetUpsidePct, formatUpsidePct } from "@/lib/marketFormat";
import { CsvImportExportBar } from "@/components/portfolio/CsvImportExportBar";
import { PortfolioAllocationChart } from "@/components/portfolio/PortfolioAllocationChart";
import { SymbolTradeCombobox } from "@/components/portfolio/SymbolTradeCombobox";
import { StockDetailModal } from "@/components/stock/StockDetailModal";
import { SortableHeaderCell, type SortDirection } from "@/components/ui/SortableHeaderCell";
import { isValidTicker } from "@/lib/csvPortfolio";
import { formatCurrency, formatDecimal, formatNumberMax2, formatPercent, formatSignedCurrency, formatWholeCurrency } from "@/lib/numberFormat";
import { recommendationActionDisplay } from "@/lib/recommendation";
import { computeTodayChangeFromLiveQuotes } from "@/lib/portfolio-net-worth-series";
import { isUsMarketExtendedHoursOpen } from "@/lib/market-hours";
import { flushCurrentPortfolioSnapshotNow } from "@/lib/portfolio-snapshot-client";

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

function actionableFilterClass(active: boolean) {
  const base =
    "rounded-full border px-2.5 py-1 text-[10px] font-semibold normal-case tracking-normal transition-colors";
  return active
    ? `${base} border-[#c79400]/45 bg-[#f3c74a]/42 text-[#6b4b00] dark:border-[#f3c74a]/45 dark:bg-[#f3c74a]/24 dark:text-[#f6d97d]`
    : `${base} border-[#d8b44a]/35 bg-[#f3c74a]/20 text-[#8a6500] hover:border-[#c79400]/35 hover:bg-[#f3c74a]/28 dark:border-[#f3c74a]/20 dark:bg-[#f3c74a]/14 dark:text-[#e7cb72] dark:hover:bg-[#f3c74a]/20`;
}

function PortfolioSummaryTiles({
  cash,
  cashInput,
  isCashEditing,
  onStartCashEdit,
  onCancelCashEdit,
  onCashInputChange,
  onSaveCash,
  assetsValue,
  netWorth,
  totalGainLoss,
  totalGainLossPct,
  portfolioTodayChange,
  showPortfolioTodayChange,
}: {
  cash: number;
  cashInput: string;
  isCashEditing: boolean;
  onStartCashEdit: () => void;
  onCancelCashEdit: () => void;
  onCashInputChange: (value: string) => void;
  onSaveCash: () => void;
  assetsValue: number;
  netWorth: number;
  totalGainLoss: number;
  totalGainLossPct: number | null;
  portfolioTodayChange: { change: number; percent: number; hasBaseline: boolean };
  showPortfolioTodayChange: boolean;
}) {
  return (
    <>
      <div className="rounded-xl border border-border/80 bg-elevated px-4 py-3 shadow-sm dark:border-white/[0.08]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">Cash balance</p>
        <div className="mt-1 flex items-center gap-2">
          {isCashEditing ? (
            <>
              <label className="min-w-0 flex-1 text-[10px] text-subtle">
                <span className="sr-only">Edit cash balance</span>
                <input
                  value={cashInput}
                  onChange={(e) => onCashInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSaveCash();
                    if (e.key === "Escape") onCancelCashEdit();
                  }}
                  className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-semibold text-foreground"
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Cash balance"
                  autoFocus
                />
              </label>
              <button
                type="button"
                onClick={onSaveCash}
                className={appCtaButton("ui-hover-pop px-2 py-1.5 text-xs")}
                aria-label="Save cash balance"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onCancelCashEdit}
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-subtle transition-colors hover:text-foreground"
                aria-label="Cancel cash edit"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold tabular-nums text-foreground">{formatCurrency(cash)}</p>
              <button
                type="button"
                onClick={onStartCashEdit}
                className="rounded-lg border border-border/70 bg-background/60 p-1.5 text-subtle transition-colors hover:text-foreground"
                aria-label="Edit cash balance"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
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
        {showPortfolioTodayChange ? (
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
  const setCash = usePortfolioStore((s) => s.setCash);
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
  const [cashInput, setCashInput] = useState(String(cash));
  const [isCashEditing, setIsCashEditing] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);

  /** Portfolio page lists positions only; watchlist-only symbols (0 qty) stay in store for trading elsewhere. */
  const holdings = useMemo(() => stocks.filter((s) => s.quantity > 0), [stocks]);
  const portfolioCountText = holdings.length === 1 ? "1 holding" : `${holdings.length} holdings`;

  useEffect(() => {
    setCashInput(String(cash));
  }, [cash]);

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
  const showPortfolioTodayChange = isUsMarketExtendedHoursOpen() && portfolioTodayChange.hasBaseline;

  function saveCash() {
    const n = parseFloat(cashInput.replace(/,/g, "")) || 0;
    setCash(n);
    recalc();
    setIsCashEditing(false);
    void flushCurrentPortfolioSnapshotNow(true);
  }

  function startCashEdit() {
    setCashInput(String(cash));
    setIsCashEditing(true);
  }

  function cancelCashEdit() {
    setCashInput(String(cash));
    setIsCashEditing(false);
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

    void flushCurrentPortfolioSnapshotNow(true);

    setNewSymbol("");
    setNewQuantity("1");
    setNewAverageCost("");
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap justify-end gap-2">
        <div className="flex flex-wrap gap-2">
          <CsvImportExportBar exportFilename="stocks-pm-portfolio.csv" compact importMode="portfolio" />
          <Link href="/csv-help" className="ui-hover-pop rounded-lg border border-primary/30 px-3 py-2 text-sm text-foreground dark:border-primary/25">
            CSV help
          </Link>
        </div>
      </div>

      <div className="hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-4">
        <PortfolioSummaryTiles
          cash={cash}
          cashInput={cashInput}
          isCashEditing={isCashEditing}
          onStartCashEdit={startCashEdit}
          onCancelCashEdit={cancelCashEdit}
          onCashInputChange={setCashInput}
          onSaveCash={saveCash}
          assetsValue={assetsValue}
          netWorth={netWorth}
          totalGainLoss={totalGainLoss}
          totalGainLossPct={totalGainLossPct}
          portfolioTodayChange={portfolioTodayChange}
          showPortfolioTodayChange={showPortfolioTodayChange}
        />
      </div>

      <div className="space-y-8">
        <div className="ui-hover-lift rounded-2xl border border-border bg-elevated px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <p className="text-base font-semibold text-foreground">Portfolio</p>
              <p className="text-xs text-subtle">{portfolioCountText}</p>
            </div>
            <div className="md:hidden">
              <button
                type="button"
                aria-expanded={mobileControlsOpen}
                aria-controls="portfolio-mobile-controls"
                onClick={() => setMobileControlsOpen((open) => !open)}
                className="rounded-xl border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
              >
                {mobileControlsOpen ? "Hide add holding" : "Show add holding"}
              </button>
            </div>
            <div
              id="portfolio-mobile-controls"
              className={`${mobileControlsOpen ? "mt-2 flex w-full" : "hidden"} flex-wrap items-end gap-2 md:mt-0 md:ml-auto md:flex md:w-auto`}
            >
              <div className="grid min-w-[18rem] flex-1 items-end gap-2 sm:grid-cols-[minmax(11rem,1.45fr)_7rem_6rem_auto] md:min-w-[34rem] md:flex-none">
                <label className="flex min-w-0 flex-col gap-0.5 text-[10px] text-subtle">
                  Add New Stock/Holding
                  <SymbolTradeCombobox
                    id="portfolio-add-holding-symbol"
                    value={newSymbol}
                    onChange={setNewSymbol}
                    portfolioStocks={stocks}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-0.5 text-[10px] text-subtle">
                  Avg cost
                  <input
                    value={newAverageCost}
                    onChange={(e) => setNewAverageCost(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addHolding()}
                    placeholder="100"
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-0.5 text-[10px] text-subtle">
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
                  <th
                    scope="col"
                    aria-sort={sort === "symbol" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                    className="px-4 pb-2 pt-3 text-center text-xs font-semibold tracking-wide"
                  >
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
                        aria-label="Filter portfolio symbols"
                      />
                    </div>
                  </th>
                  <SortableHeaderCell label="Last" column="lastPrice" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" />
                  <SortableHeaderCell label="Chg" column="today" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" />
                  <SortableHeaderCell label="Qty" column="quantity" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" />
                  <SortableHeaderCell label="Avg" column="averageCost" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" />
                  <SortableHeaderCell label="Costbasis" column="costBasis" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" />
                  <SortableHeaderCell label="Current Value" column="value" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" />
                  <SortableHeaderCell label="P/L" column="gainLoss" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" />
                  <SortableHeaderCell label="Potential Upside" column="upside" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" />
                  <SortableHeaderCell label="Score" column="score" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" />
                  <th scope="col" aria-sort={sort === "signal" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"} className="px-4 pb-2 pt-3 text-center text-xs font-semibold tracking-wide">
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
                        className={actionableFilterClass(showActionable)}
                      >
                        {showActionable ? "Showing actionable" : "Filter actionable"}
                      </button>
                    </div>
                  </th>
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
                      className="cursor-pointer transition-colors duration-150 hover:bg-muted/50 dark:hover:bg-white/[0.04]"
                      onClick={() => setDetailSymbol(s.symbol)}
                    >
                      <td className="px-4 py-3 align-middle text-center">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDetailSymbol(s.symbol);
                            }}
                            className={`ui-hover-text inline-flex max-w-full items-center justify-center gap-1 truncate font-medium hover:underline ${recSymbolTextClass(s.recommendation?.action)}`}
                          >
                            {s.symbol}
                          </button>
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
                      <td className={`px-4 py-3 text-center tabular-nums font-medium ${upsideTextClass(upside)}`}>
                        {formatUpsidePct(upside)}
                      </td>
                      <td className={`px-4 py-3 text-center tabular-nums font-medium ${scoreTextClass(s.score)}`}>{s.score != null ? formatDecimal(s.score) : "—"}</td>
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

      <StockDetailModal symbol={detailSymbol} onClose={() => setDetailSymbol(null)} />
    </div>
  );
}
