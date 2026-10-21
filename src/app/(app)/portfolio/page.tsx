"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePortfolioStore } from "@/store/portfolioStore";
import { analystTargetUpsidePct, formatScore, formatUpsidePct } from "@/lib/marketFormat";
import { CsvImportExportBar } from "@/components/portfolio/CsvImportExportBar";
import { AddAssetButton } from "@/components/portfolio/AddAssetForm";
import { PortfolioSimulateLink } from "@/components/nav/PortfolioSimulateLink";
import { StockDetailModal } from "@/components/stock/StockDetailModal";
import { SortableHeaderCell, type SortDirection } from "@/components/ui/SortableHeaderCell";
import { formatCurrency, formatDecimal, formatPercent, formatWholeCurrency } from "@/lib/numberFormat";
import { dividendYieldPercent, preferredSymbolsForShortlistIndicator, symbolShortlistTextClass } from "@/lib/ios-recommendation";
import { recommendationActionDisplay } from "@/lib/recommendation";
import { fieldInputClass } from "@/lib/field-input";
import { cashByAccount, displayAccount, isCashSymbol } from "@/lib/cash-accounts";

type SortKey = "symbol" | "analyst" | "averageCost" | "costBasis" | "lastPrice" | "value" | "gainLoss" | "yield" | "peg" | "debt" | "upside" | "score" | "today" | "signal";

type OpenLotLike = { quantity: number; costBasis: number; account?: string };

/** Account filter uses that account's open lots, matching iOS `displayMetrics`. */
function positionMetrics(
  stock: { quantity: number; averageCost: number; lastPrice?: number },
  openLots: OpenLotLike[] | undefined,
  accountFilter: string
): { quantity: number; averageCost: number; costBasis: number; value: number } {
  const price = stock.lastPrice ?? 0;
  if (accountFilter === "__all__") {
    const costBasis = stock.quantity * stock.averageCost;
    return { quantity: stock.quantity, averageCost: stock.averageCost, costBasis, value: stock.quantity * price };
  }
  const target = displayAccount(accountFilter).toLowerCase();
  const scoped = (openLots ?? []).filter(
    (lot) => (Number(lot.quantity) || 0) > 0.000001 && displayAccount(lot.account).toLowerCase() === target
  );
  const quantity = scoped.reduce((sum, lot) => sum + Math.max(0, lot.quantity), 0);
  const costBasis = scoped.reduce((sum, lot) => sum + Math.max(0, lot.quantity) * Math.max(0, lot.costBasis), 0);
  const averageCost = quantity > 0 ? costBasis / quantity : 0;
  return { quantity, averageCost, costBasis, value: quantity * price };
}

const DEFAULT_SORT_DIRECTION: Record<SortKey, SortDirection> = {
  symbol: "asc",
  analyst: "desc",
  averageCost: "desc",
  costBasis: "desc",
  lastPrice: "desc",
  value: "desc",
  gainLoss: "desc",
  yield: "desc",
  peg: "asc",
  debt: "asc",
  upside: "desc",
  score: "desc",
  today: "desc",
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
  if (score >= 50) return "text-red-600/85 dark:text-[#ff6157]";
  return "text-red-600 dark:text-[#ff6157]";
}

function analystRatingTextClass(value: string | null | undefined): string {
  const rating = typeof value === "string" ? Number.parseFloat(value) : Number.NaN;
  if (!Number.isFinite(rating)) return "text-subtle";
  if (rating >= 4.5) return "text-emerald-600 dark:text-emerald-400";
  if (rating >= 4.0) return "text-emerald-600/90 dark:text-emerald-300";
  if (rating >= 3.5) return "text-primary dark:text-primary";
  if (rating >= 3.0) return "text-amber-600 dark:text-amber-300";
  if (rating >= 2.5) return "text-red-600/85 dark:text-[#ff6157]";
  return "text-red-600 dark:text-[#ff6157]";
}

function pegTextClass(peg: number | null | undefined): string {
  if (peg == null || !Number.isFinite(peg) || peg <= 0) return "text-subtle";
  if (peg <= 1) return "text-emerald-700 dark:text-emerald-400";
  if (peg > 2) return "text-red-700 dark:text-[#ff6157]";
  return "text-foreground";
}

function debtRatioTextClass(raw: number | null | undefined): string {
  if (raw == null || !Number.isFinite(raw) || raw < 0) return "text-subtle";
  const ratio = raw > 1 ? raw / 100 : raw;
  if (ratio < 0.5) return "text-emerald-700 dark:text-emerald-400";
  if (ratio > 1) return "text-red-700 dark:text-[#ff6157]";
  return "text-foreground";
}

function upsideTextClass(upside: number | null | undefined): string {
  if (upside == null || !Number.isFinite(upside)) return "text-subtle";
  if (upside > 50) return "text-emerald-600 dark:text-emerald-400";
  if (upside >= 25) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-[#ff6157]";
  return "text-subtle";
}

function filterChipClass(active: boolean, tone: "green" | "gold") {
  const base = "no-ui-hover inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-tight";
  if (!active) return `${base} border-border bg-background text-foreground`;
  if (tone === "green") return `${base} border-transparent bg-emerald-500/90 text-white`;
  return `${base} border-transparent bg-[#f3c74a] text-black`;
}

export default function PortfolioPage() {
  const stocks = usePortfolioStore((s) => s.stocks);
  const portfolioSize = usePortfolioStore((s) => s.portfolioSize);
  const limitWatchlistSize = usePortfolioStore((s) => s.limitWatchlistSize);
  const enableRiskFilter = usePortfolioStore((s) => s.enableRiskFilter);
  const riskAppetite = usePortfolioStore((s) => s.riskAppetite);
  const fixedIncomeByAccount = usePortfolioStore((s) => s.fixedIncomeByAccount);
  const lotsBySymbol = usePortfolioStore((s) => s.lotsBySymbol);
  const [sort, setSort] = useState<SortKey>("symbol");
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_SORT_DIRECTION.symbol);
  const [query, setQuery] = useState("");
  const [showActionable, setShowActionable] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string>("__all__");
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);

  const shortlistedSymbols = useMemo(
    () =>
      preferredSymbolsForShortlistIndicator(stocks, {
        limitWatchlistSize,
        enableRiskFilter,
        riskAppetite,
        portfolioSize,
      }),
    [enableRiskFilter, limitWatchlistSize, portfolioSize, riskAppetite, stocks]
  );

  /** Portfolio page lists positions only; watchlist-only symbols (0 qty) stay in store for trading elsewhere. */
  const accountOptions = useMemo(() => {
    const names = new Set<string>();
    for (const stock of stocks) {
      const lots = lotsBySymbol[stock.symbol];
      for (const lot of lots?.open ?? []) {
        if ((Number(lot.quantity) || 0) <= 0.005) continue;
        names.add(displayAccount(lot.account));
      }
    }
    for (const account of Object.keys(cashByAccount(lotsBySymbol["$CASH"]))) {
      names.add(displayAccount(account));
    }
    for (const [account, amount] of Object.entries(fixedIncomeByAccount)) {
      if (Number(amount) > 0.005) names.add(displayAccount(account));
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [stocks, lotsBySymbol, fixedIncomeByAccount]);

  const holdings = useMemo(() => stocks.filter((s) => s.quantity > 0 && s.symbol !== "$CASH"), [stocks]);

  const stockMatchesAccount = useCallback((symbol: string): boolean => {
    if (selectedAccount === "__all__") return true;
    const target = displayAccount(selectedAccount).toLowerCase();
    const lots = lotsBySymbol[symbol];
    if (!lots || lots.open.length === 0) return displayAccount("").toLowerCase() === target;
    return lots.open.some((lot) => (Number(lot.quantity) || 0) > 0.005 && displayAccount(lot.account).toLowerCase() === target);
  }, [selectedAccount, lotsBySymbol]);
  const portfolioCountText = holdings.length === 1 ? "1 holding" : `${holdings.length} holdings`;

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
    let r = [...holdings].filter((s) => stockMatchesAccount(s.symbol));
    const q = query.trim().toUpperCase();
    if (showActionable) r = r.filter((s) => isActionable(s.recommendation?.action));
    if (q) r = r.filter((s) => s.symbol.includes(q));
    r.sort((a, b) => {
      const metricsA = positionMetrics(a, lotsBySymbol[a.symbol]?.open, selectedAccount);
      const metricsB = positionMetrics(b, lotsBySymbol[b.symbol]?.open, selectedAccount);
      const valueA = metricsA.value;
      const valueB = metricsB.value;
      const costBasisA = metricsA.costBasis;
      const costBasisB = metricsB.costBasis;
      const gainLossA = valueA - costBasisA;
      const gainLossB = valueB - costBasisB;
      const upsideA = analystTargetUpsidePct(a.lastPrice, a.analystTarget);
      const upsideB = analystTargetUpsidePct(b.lastPrice, b.analystTarget);
      const analystA = Number.parseFloat(a.analystAvg ?? "");
      const analystB = Number.parseFloat(b.analystAvg ?? "");
      const todayA = a.dailyChangePercent ?? Number.NEGATIVE_INFINITY;
      const todayB = b.dailyChangePercent ?? Number.NEGATIVE_INFINITY;

      let cmp = 0;
      switch (sort) {
        case "symbol":
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case "analyst":
          cmp = (Number.isFinite(analystA) ? analystA : Number.NEGATIVE_INFINITY) - (Number.isFinite(analystB) ? analystB : Number.NEGATIVE_INFINITY);
          break;
        case "averageCost":
          cmp = metricsA.averageCost - metricsB.averageCost;
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
        case "gainLoss": {
          const pctA = costBasisA > 0 ? Math.round((gainLossA / costBasisA) * 100) : Number.NEGATIVE_INFINITY;
          const pctB = costBasisB > 0 ? Math.round((gainLossB / costBasisB) * 100) : Number.NEGATIVE_INFINITY;
          cmp = pctA - pctB;
          break;
        }
        case "yield": {
          const yieldA = a.dividendYield != null && a.dividendYield > 0 ? dividendYieldPercent(a.dividendYield) : Number.NEGATIVE_INFINITY;
          const yieldB = b.dividendYield != null && b.dividendYield > 0 ? dividendYieldPercent(b.dividendYield) : Number.NEGATIVE_INFINITY;
          cmp = yieldA - yieldB;
          break;
        }
        case "peg":
          cmp = (a.peg != null && a.peg > 0 ? a.peg : Number.POSITIVE_INFINITY) - (b.peg != null && b.peg > 0 ? b.peg : Number.POSITIVE_INFINITY);
          break;
        case "debt":
          cmp = (a.debtToEquity != null && a.debtToEquity >= 0 ? a.debtToEquity : Number.POSITIVE_INFINITY) - (b.debtToEquity != null && b.debtToEquity >= 0 ? b.debtToEquity : Number.POSITIVE_INFINITY);
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
  }, [holdings, lotsBySymbol, query, selectedAccount, showActionable, sort, sortDirection, stockMatchesAccount]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PortfolioSimulateLink />
        <div className="flex flex-wrap gap-2">
          <CsvImportExportBar exportFilename="stocks-pm-portfolio.csv" compact importMode="portfolio" />
          <Link href="/csv-help" className="ui-hover-pop rounded-lg border border-primary/30 px-3 py-2 text-sm text-foreground dark:border-primary/25">
            CSV help
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        <div className="ui-hover-lift rounded-2xl border border-border bg-elevated px-3 py-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={selectedAccount}
              onChange={(event) => setSelectedAccount(event.target.value)}
              aria-label="Account"
              className={
                selectedAccount === "__all__"
                  ? filterChipClass(false, "green")
                  : "inline-flex items-center rounded-full border border-transparent bg-[#3370c2] px-2.5 py-0.5 text-xs font-semibold leading-tight text-white dark:bg-[#66abf5] dark:text-black"
              }
            >
              <option value="__all__">All Accounts</option>
              {accountOptions.map((account) => (
                <option key={account} value={account}>{account}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowActionable((value) => !value)}
              className={filterChipClass(showActionable, "green")}
              aria-pressed={showActionable}
            >
              Actionable
            </button>
            <AddAssetButton idPrefix="portfolio-add" />
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className={`${filterChipClass(false, "green")} ${searchOpen ? "pointer-events-none invisible" : ""}`}
              aria-hidden={searchOpen}
              tabIndex={searchOpen ? -1 : 0}
            >
              Search
            </button>
            <p className="ml-auto shrink-0 text-xs text-subtle">{portfolioCountText}</p>
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
                aria-label="Filter portfolio symbols"
                autoFocus
              />
            </div>
          ) : null}
        </div>

        <div className="ui-hover-lift overflow-x-auto rounded-2xl border border-border bg-elevated">
            <table className="w-full table-auto border-collapse text-xs sm:text-sm md:table-fixed">
              <colgroup>
                <col className="w-[20%] md:w-[10%]" />
                <col className="w-[18%] md:hidden" />
                <col className="hidden md:table-column md:w-[7%]" />
                <col className="hidden md:table-column md:w-[7%]" />
                <col className="hidden sm:table-column sm:w-[9%] md:w-[7%]" />
                <col className="hidden md:table-column md:w-[8%]" />
                <col className="w-[22%] md:w-[7%]" />
                <col className="hidden md:table-column md:w-[7%]" />
                <col className="w-[18%] md:w-[9%]" />
                <col className="hidden md:table-column md:w-[7%]" />
                <col className="hidden md:table-column md:w-[8%]" />
                <col className="hidden md:table-column md:w-[8%]" />
                <col className="hidden md:table-column md:w-[6%]" />
                <col className="w-[22%] md:w-[9%]" />
              </colgroup>
              <thead className="border-b border-zinc-400/70 bg-zinc-300/95 text-subtle dark:border-zinc-600 dark:bg-zinc-700/85">
                <tr>
                  <SortableHeaderCell label="Symbol" column="symbol" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="px-2 pb-2 pt-2.5 md:px-4 md:pt-3" />
                  <SortableHeaderCell label="Last / Chg" column="lastPrice" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="px-2 pb-2 pt-2.5 md:hidden" />
                  <SortableHeaderCell label="Last" column="lastPrice" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden px-4 pb-2 pt-3 md:table-cell" />
                  <SortableHeaderCell label="Chg" column="today" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden px-4 pb-2 pt-3 md:table-cell" />
                  <SortableHeaderCell label="Avg" column="averageCost" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden px-3 pb-2 pt-2.5 sm:table-cell md:px-4 md:pt-3" />
                  <SortableHeaderCell label="Costbasis" column="costBasis" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden px-4 pb-2 pt-3 md:table-cell" />
                  <SortableHeaderCell label="Gain" column="gainLoss" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="px-2 pb-2 pt-2.5 md:px-4 md:pt-3" />
                  <SortableHeaderCell label="Div%" column="yield" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden px-2 pb-2 pt-2.5 md:table-cell md:px-3 md:pt-3" />
                  <SortableHeaderCell label="Analyst Rating" column="analyst" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="whitespace-nowrap px-2 pb-2 pt-2.5 md:px-3 md:pt-3" />
                  <SortableHeaderCell label="PEG" column="peg" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden px-2 pb-2 pt-2.5 md:table-cell md:px-3 md:pt-3" />
                  <SortableHeaderCell label="Debt ratio" column="debt" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden px-2 pb-2 pt-2.5 md:table-cell md:px-3 md:pt-3" />
                  <SortableHeaderCell label="Potential Upside" column="upside" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden px-4 pb-2 pt-3 md:table-cell" />
                  <SortableHeaderCell label="Score" column="score" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden px-4 pb-2 pt-3 md:table-cell" />
                  <SortableHeaderCell label="Rec" column="signal" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="px-2 pb-2 pt-2.5 sm:hidden" />
                  <SortableHeaderCell label="Recommendation" column="signal" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden px-4 pb-2 pt-3 sm:table-cell" />
                </tr>
              </thead>
              <tbody>
                {rows.flatMap((s) => {
                  const metrics = positionMetrics(s, lotsBySymbol[s.symbol]?.open, selectedAccount);
                  const value = metrics.value;
                  const costBasis = metrics.costBasis;
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
                      <td className="px-2 py-2.5 align-middle text-center md:px-4 md:py-3">
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setDetailSymbol(s.symbol);
                            }}
                            className={`ui-hover-text inline-flex max-w-full items-center justify-center gap-1 truncate hover:underline ${symbolShortlistTextClass(s, shortlistedSymbols, { limitWatchlistSize, mode: "portfolio" })}`}
                          >
                            {s.symbol}
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-center tabular-nums md:hidden">
                        <div className="flex min-w-[4.25rem] flex-col items-center leading-tight sm:min-w-[5rem]">
                          <span className="text-foreground">{formatCurrency(s.lastPrice ?? 0)}</span>
                          <span
                            className={
                              d == null
                                ? "text-[11px] text-subtle"
                                : d > 0
                                  ? "text-[11px] font-medium text-emerald-700 dark:text-primary"
                                  : d < 0
                                    ? "text-[11px] font-medium text-red-700 dark:text-[#ff6157]"
                                    : "text-[11px] text-subtle"
                            }
                          >
                            {d != null && Number.isFinite(d) ? formatPercent(d, true) : "—"}
                          </span>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 text-center tabular-nums text-foreground md:table-cell">{formatCurrency(s.lastPrice ?? 0)}</td>
                      <td
                        className={`hidden px-4 py-3 text-center tabular-nums font-medium md:table-cell ${
                          d == null ? "text-subtle" : d > 0 ? "text-emerald-700 dark:text-primary" : d < 0 ? "text-red-700 dark:text-[#ff6157]" : "text-subtle"
                        }`}
                      >
                        {d != null && Number.isFinite(d) ? formatPercent(d, true) : "—"}
                      </td>
                      <td className="hidden px-3 py-2.5 text-center tabular-nums text-foreground sm:table-cell md:px-4 md:py-3">{formatCurrency(metrics.averageCost)}</td>
                      <td className="hidden px-4 py-3 text-center tabular-nums text-foreground md:table-cell">{formatWholeCurrency(costBasis)}</td>
                      <td className="px-2 py-2.5 text-center tabular-nums md:px-4 md:py-3">
                        <span
                          className={`font-medium ${
                            gainLoss > 0
                              ? "text-emerald-700 dark:text-primary"
                              : gainLoss < 0
                                ? "text-red-700 dark:text-[#ff6157]"
                                : "text-subtle"
                          }`}
                        >
                          {gainLossPct == null
                            ? "—"
                            : `${Math.round(gainLossPct) >= 0 ? "+" : ""}${Math.round(gainLossPct)}%`}
                        </span>
                      </td>
                      <td className="hidden px-2 py-3 text-center tabular-nums font-medium text-foreground md:table-cell md:px-3">
                        {s.dividendYield != null && s.dividendYield > 0
                          ? `${dividendYieldPercent(s.dividendYield).toFixed(1)}%`
                          : "—"}
                      </td>
                      <td
                        className={`px-2 py-2.5 text-center tabular-nums font-medium md:px-3 md:py-3 ${analystRatingTextClass(s.analystAvg)}`}
                        title="Consensus / average rating when available from data refresh"
                      >
                        {s.analystAvg != null && Number.isFinite(Number.parseFloat(s.analystAvg))
                          ? formatDecimal(Number.parseFloat(s.analystAvg))
                          : "—"}
                      </td>
                      <td className={`hidden px-2 py-3 text-center tabular-nums font-medium md:table-cell md:px-3 ${pegTextClass(s.peg)}`}>
                        {s.peg != null && s.peg > 0 ? formatDecimal(s.peg) : "—"}
                      </td>
                      <td className={`hidden px-2 py-3 text-center tabular-nums font-medium md:table-cell md:px-3 ${debtRatioTextClass(s.debtToEquity)}`}>
                        {s.debtToEquity != null && s.debtToEquity >= 0 ? String(Math.round(s.debtToEquity)) : "—"}
                      </td>
                      <td className={`hidden px-4 py-3 text-center tabular-nums font-medium md:table-cell ${upsideTextClass(upside)}`}>
                        {formatUpsidePct(upside)}
                      </td>
                      <td className={`hidden px-4 py-3 text-center tabular-nums font-medium md:table-cell ${scoreTextClass(s.score)}`}>{s.score != null ? formatScore(s.score) : "—"}</td>
                      <td className="px-2 py-2.5 align-middle text-center md:px-4 md:py-3">
                        {s.recommendation ? (
                          <span
                            className={`inline-flex max-w-full items-center justify-center truncate rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide sm:px-2 sm:text-[11px] ${recBadgeClass(s.recommendation.action)}`}
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

      </div>

      <StockDetailModal symbol={detailSymbol} onClose={() => setDetailSymbol(null)} />
    </div>
  );
}
