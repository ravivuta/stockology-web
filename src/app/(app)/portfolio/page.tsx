"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePortfolioStore } from "@/store/portfolioStore";
import { analystTargetUpsidePct, formatUpsidePct } from "@/lib/marketFormat";
import { CsvImportExportBar } from "@/components/portfolio/CsvImportExportBar";
import { AddAssetButton } from "@/components/portfolio/AddAssetForm";
import { PortfolioSimulateLink } from "@/components/nav/PortfolioSimulateLink";
import { StockDetailModal } from "@/components/stock/StockDetailModal";
import { SortableHeaderCell, type SortDirection } from "@/components/ui/SortableHeaderCell";
import { formatCurrency, formatDecimal, formatNumberMax2, formatPercent, formatSignedCurrency, formatWholeCurrency } from "@/lib/numberFormat";
import { recommendationActionDisplay } from "@/lib/recommendation";
import { computeTodayChangeFromHistory, computeTodayChangeFromLiveQuotes, fetchCloudNetWorthHistory, type NetWorthPoint } from "@/lib/portfolio-net-worth-series";
import { isUsMarketTradingDay } from "@/lib/market-hours";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { resolveStocksPmDataUserId } from "@/lib/resolve-stocks-pm-data-user-id";
import { fieldInputClass } from "@/lib/field-input";
import { cashByAccount, displayAccount, isCashSymbol } from "@/lib/cash-accounts";
import { fixedIncomeTotal } from "@/lib/fixed-income-accounts";

type SortKey = "symbol" | "quantity" | "averageCost" | "costBasis" | "lastPrice" | "value" | "gainLoss" | "upside" | "score" | "today" | "signal";

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
  if (upside > 50) return "text-emerald-600 dark:text-emerald-400";
  if (upside >= 25) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
  return "text-subtle";
}

function filterChipClass(active: boolean, tone: "green" | "gold") {
  const base = "no-ui-hover inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold";
  if (!active) return `${base} border-border bg-background text-foreground`;
  if (tone === "green") return `${base} border-transparent bg-emerald-500/90 text-white`;
  return `${base} border-transparent bg-[#f3c74a] text-black`;
}

function PortfolioSummaryTiles({
  cash,
  fixedIncome,
  assetsValue,
  netWorth,
  totalGainLoss,
  totalGainLossPct,
  portfolioTodayChange,
  showPortfolioTodayChange,
}: {
  cash: number;
  fixedIncome: number;
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
        <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatCurrency(cash)}</p>
        <p className="mt-0.5 text-[11px] text-subtle">Edit per account from Dashboard</p>
      </div>
      <div className="rounded-xl border border-border/80 bg-elevated px-4 py-3 shadow-sm dark:border-white/[0.08]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">Assets value</p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatCurrency(assetsValue)}</p>
        <p className="mt-0.5 text-[11px] text-subtle">Holdings at last price</p>
        <p className="mt-1 text-[11px] text-subtle">Fixed income: {formatCurrency(fixedIncome)}</p>
      </div>
      <div className="rounded-xl border border-border/80 bg-elevated px-4 py-3 shadow-sm dark:border-white/[0.08]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-subtle">Net worth</p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{formatCurrency(netWorth)}</p>
        <p className="mt-0.5 text-[11px] text-subtle">Cash + assets + fixed income</p>
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
  const fixedIncomeByAccount = usePortfolioStore((s) => s.fixedIncomeByAccount);
  const lotsBySymbol = usePortfolioStore((s) => s.lotsBySymbol);
  const [sort, setSort] = useState<SortKey>("symbol");
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_SORT_DIRECTION.symbol);
  const [query, setQuery] = useState("");
  const [showActionable, setShowActionable] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string>("__all__");
  const [cloudHistory, setCloudHistory] = useState<NetWorthPoint[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!hasSupabaseConfig()) { if (!cancelled) setCloudHistory([]); return; }
      try {
        const supabase = createClient();
        const cachedDataUserId = typeof sessionStorage !== "undefined"
          ? sessionStorage.getItem("stocks-pm-active-data-user-id") : null;
        if (cachedDataUserId) {
          const rows = await fetchCloudNetWorthHistory(supabase, cachedDataUserId);
          if (!cancelled) setCloudHistory(rows);
          return;
        }
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) { if (!cancelled) setCloudHistory([]); return; }
        const dataUserId = await resolveStocksPmDataUserId(supabase, uid);
        const rows = await fetchCloudNetWorthHistory(supabase, dataUserId);
        if (!cancelled) setCloudHistory(rows);
      } catch { if (!cancelled) setCloudHistory([]); }
    }
    void run();
    return () => { cancelled = true; };
  }, []);
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);

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
      const todayA = a.dailyChangePercent ?? Number.NEGATIVE_INFINITY;
      const todayB = b.dailyChangePercent ?? Number.NEGATIVE_INFINITY;

      let cmp = 0;
      switch (sort) {
        case "symbol":
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case "quantity":
          cmp = metricsA.quantity - metricsB.quantity;
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
  }, [holdings, lotsBySymbol, query, selectedAccount, showActionable, sort, sortDirection, stockMatchesAccount]);

  const { assetsValue, totalGainLoss, totalGainLossPct, netWorth, portfolioTodayChange, fixedIncomeValue } = useMemo(() => {
    const assets = stocks.filter((s) => !isCashSymbol(s.symbol)).reduce((a, s) => a + s.quantity * (s.lastPrice ?? 0), 0);
    const holdingsCostBasis = stocks.filter((s) => !isCashSymbol(s.symbol)).reduce((a, s) => a + s.quantity * s.averageCost, 0);
    const fixedIncomeValue = fixedIncomeTotal(fixedIncomeByAccount);
    const totalGainLoss = assets - holdingsCostBasis;
    const totalGainLossPct = holdingsCostBasis > 0 ? (totalGainLoss / holdingsCostBasis) * 100 : null;
    const net = assets + cash + fixedIncomeValue;
    const liveQuoteChange = computeTodayChangeFromLiveQuotes(stocks, cash);
    // Prefer live-quote delta when non-trivial; fall back to snapshot when dailyChangePercent is
    // still at its default 0 (not yet refreshed) so Today shows as soon as cloud history loads.
    const snapshotChange = computeTodayChangeFromHistory(cloudHistory ?? [], net);
    const portfolioTodayChange =
      liveQuoteChange.hasBaseline && Math.abs(liveQuoteChange.change) > 0.01
        ? liveQuoteChange
        : snapshotChange;
    return { assetsValue: assets, holdingsCostBasis, totalGainLoss, totalGainLossPct, netWorth: net, portfolioTodayChange, fixedIncomeValue };
  }, [stocks, cash, fixedIncomeByAccount, cloudHistory]);
  const showPortfolioTodayChange = isUsMarketTradingDay() && portfolioTodayChange.hasBaseline && Math.abs(portfolioTodayChange.change) > 0.01;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PortfolioSimulateLink />
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
          fixedIncome={fixedIncomeValue}
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
          <div>
            <p className="text-base font-semibold text-foreground">Portfolio</p>
            <p className="text-xs text-subtle">{portfolioCountText}</p>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <select
              value={selectedAccount}
              onChange={(event) => setSelectedAccount(event.target.value)}
              aria-label="Account"
              className={
                selectedAccount === "__all__"
                  ? filterChipClass(false, "green")
                  : "inline-flex items-center rounded-full border border-transparent bg-[#3370c2] px-3 py-1 text-xs font-semibold text-white dark:bg-[#66abf5] dark:text-black"
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
            <table className="w-full table-auto text-xs sm:text-sm md:min-w-[1180px] md:table-fixed">
              <colgroup>
                <col className="w-[22%] md:w-[13%]" />
                <col className="w-[20%] md:hidden" />
                <col className="hidden md:table-column md:w-[8%]" />
                <col className="hidden md:table-column md:w-[8%]" />
                <col className="w-[12%] md:w-[7%]" />
                <col className="hidden sm:table-column sm:w-[9%] md:w-[9%]" />
                <col className="hidden md:table-column md:w-[10%]" />
                <col className="w-[22%] md:w-[16%]" />
                <col className="hidden md:table-column md:w-[7%]" />
                <col className="hidden md:table-column md:w-[6%]" />
                <col className="w-[24%] md:w-[9%]" />
              </colgroup>
              <thead className="border-b border-zinc-400/70 bg-zinc-300/95 text-subtle dark:border-zinc-600 dark:bg-zinc-700/85">
                <tr>
                  <SortableHeaderCell label="Symbol" column="symbol" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="px-2 pb-2 pt-2.5 md:px-4 md:pt-3" />
                  <SortableHeaderCell label="Last / Chg" column="lastPrice" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="px-2 pb-2 pt-2.5 md:hidden" />
                  <SortableHeaderCell label="Last" column="lastPrice" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden px-4 pb-2 pt-3 md:table-cell" />
                  <SortableHeaderCell label="Chg" column="today" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden px-4 pb-2 pt-3 md:table-cell" />
                  <SortableHeaderCell label="Qty" column="quantity" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="px-2 pb-2 pt-2.5 md:px-4 md:pt-3" />
                  <SortableHeaderCell label="Avg" column="averageCost" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden px-3 pb-2 pt-2.5 sm:table-cell md:px-4 md:pt-3" />
                  <SortableHeaderCell label="Costbasis" column="costBasis" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="hidden px-4 pb-2 pt-3 md:table-cell" />
                  <SortableHeaderCell label="Gain" column="gainLoss" activeColumn={sort} direction={sortDirection} onSort={toggleSort} align="center" className="px-2 pb-2 pt-2.5 md:px-4 md:pt-3" />
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
                            className={`ui-hover-text inline-flex max-w-full items-center justify-center gap-1 truncate font-medium hover:underline ${recSymbolTextClass(s.recommendation?.action)}`}
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
                                    ? "text-[11px] font-medium text-red-700 dark:text-red-400"
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
                          d == null ? "text-subtle" : d > 0 ? "text-emerald-700 dark:text-primary" : d < 0 ? "text-red-700 dark:text-red-400" : "text-subtle"
                        }`}
                      >
                        {d != null && Number.isFinite(d) ? formatPercent(d, true) : "—"}
                      </td>
                      <td className="px-2 py-2.5 text-center tabular-nums text-foreground md:px-4 md:py-3">{formatNumberMax2(metrics.quantity)}</td>
                      <td className="hidden px-3 py-2.5 text-center tabular-nums text-foreground sm:table-cell md:px-4 md:py-3">{formatCurrency(metrics.averageCost)}</td>
                      <td className="hidden px-4 py-3 text-center tabular-nums text-foreground md:table-cell">{formatWholeCurrency(costBasis)}</td>
                      <td className="px-2 py-2.5 text-center tabular-nums md:px-4 md:py-3">
                        <span
                          className={`font-medium ${
                            gainLoss > 0
                              ? "text-emerald-700 dark:text-primary"
                              : gainLoss < 0
                                ? "text-red-700 dark:text-red-400"
                                : "text-subtle"
                          }`}
                        >
                          {gainLossPct == null
                            ? "—"
                            : `${gainLossPct >= 0 ? "+" : ""}${gainLossPct.toFixed(1)}%`}
                        </span>
                      </td>
                      <td className={`hidden px-4 py-3 text-center tabular-nums font-medium md:table-cell ${upsideTextClass(upside)}`}>
                        {formatUpsidePct(upside)}
                      </td>
                      <td className={`hidden px-4 py-3 text-center tabular-nums font-medium md:table-cell ${scoreTextClass(s.score)}`}>{s.score != null ? formatDecimal(s.score) : "—"}</td>
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
