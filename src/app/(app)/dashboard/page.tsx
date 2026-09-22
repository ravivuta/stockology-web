"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { appCtaButton } from "@/lib/appCtaClasses";
import { usePortfolioStore } from "@/store/portfolioStore";
import { PortfolioDonut } from "@/components/dashboard/PortfolioDonut";
import { StockDetailExpandPanel } from "@/components/stock/StockDetailExpandPanel";
import { RecommendedActionsWidget } from "@/components/dashboard/RecommendedActionsWidget";
import { DashboardReturnComparison } from "@/components/dashboard/DashboardReturnComparison";
import { CashAccountsEditor } from "@/components/dashboard/CashAccountsEditor";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { resolveStocksPmDataUserId } from "@/lib/resolve-stocks-pm-data-user-id";
import {
  computeTodayChangeFromHistory,
  computeTodayChangeFromLiveQuotes,
  fetchCloudNetWorthHistory,
  type NetWorthPoint,
} from "@/lib/portfolio-net-worth-series";
import { isUsMarketTradingDay } from "@/lib/market-hours";
import { formatAbsPercent, formatCompactCurrency, formatCompactNumber, formatCurrency, formatPercent } from "@/lib/numberFormat";
import { cashByAccount, displayAccount, isCashSymbol } from "@/lib/cash-accounts";

const CURRENT_VALUE_COLOR = "#14b8a6";

const PALETTE = {
  cash: "var(--dashboard-chart-cash)",
  costBasis: "var(--dashboard-chart-cost-basis)",
  gain: "var(--dashboard-chart-gain)",
  holdingsValue: CURRENT_VALUE_COLOR,
  loss: "var(--dashboard-chart-loss)",
} as const;

const ACCOUNT_COLORS = [
  "#8b5e34",
  "#0f9aa7",
  "#a47148",
  "#138a96",
  "#7a4a21",
  "#0b7285",
  "#b07d52",
] as const;

export default function DashboardPage() {
  const reduceMotion = useReducedMotion();
  const stocks = usePortfolioStore((s) => s.stocks);
  const cash = usePortfolioStore((s) => s.cashBalance);
  const lotsBySymbol = usePortfolioStore((s) => s.lotsBySymbol);
  const [bars, setBars] = useState(true);
  const [showCashEditor, setShowCashEditor] = useState(false);
  const [dashStockDetail, setDashStockDetail] = useState<string | null>(null);
  // Pre-seed from the same cache used by DashboardReturnComparison for instant today-value display
  const [cloudHistory, setCloudHistory] = useState<NetWorthPoint[] | null>(() => {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem("dash_chart_cloudPts") : null;
      return raw ? (JSON.parse(raw) as NetWorthPoint[]) : null;
    } catch {
      return null;
    }
  });

  const held = useMemo(() => stocks.filter((s) => s.quantity > 0 && !isCashSymbol(s.symbol)), [stocks]);
  const holdingsValue = useMemo(() => held.reduce((a, s) => a + s.quantity * (s.lastPrice ?? 0), 0), [held]);
  const holdingsCostBasis = useMemo(() => held.reduce((a, s) => a + s.quantity * s.averageCost, 0), [held]);
  const holdingsPnL = holdingsValue - holdingsCostBasis;
  const totalBalance = holdingsValue + cash;
  const isProfitable = holdingsPnL >= 0;
  const totalPnLPct = holdingsCostBasis > 0 ? (holdingsPnL / holdingsCostBasis) * 100 : 0;
  const todaySnapshotChange = useMemo(
    () => computeTodayChangeFromHistory(cloudHistory ?? [], totalBalance),
    [cloudHistory, totalBalance]
  );
  const todayQuoteChange = useMemo(
    () => computeTodayChangeFromLiveQuotes(stocks.filter((s) => !isCashSymbol(s.symbol)), cash),
    [stocks, cash]
  );
  // Prefer live-quote delta only when it's non-trivial (avoids using defaulted dailyChangePercent:0
  // blocking the snapshot fallback — stocks default to 0% until a real price refresh arrives).
  const todayChange =
    todayQuoteChange.hasBaseline && Math.abs(todayQuoteChange.change) > 0.01
      ? todayQuoteChange
      : todaySnapshotChange;
  const showTodayChange = isUsMarketTradingDay() && todayChange.hasBaseline && Math.abs(todayChange.change) > 0.01;
  const todayValueClassName =
    todayChange.change >= 0
      ? "font-semibold text-[color:var(--dashboard-chart-gain)]"
      : "font-semibold text-[color:var(--dashboard-chart-loss)]";
  const todayStatusLoading = cloudHistory === null && hasSupabaseConfig();

  const pieData = useMemo(() => {
    if (isProfitable) {
      const tb = Math.max(totalBalance, 0.0001);
      return [
        { name: "Cash", value: cash / tb, color: PALETTE.cash },
        { name: "Cost", value: holdingsCostBasis / tb, color: PALETTE.costBasis },
        { name: "Gain", value: Math.max(holdingsPnL, 0) / tb, color: PALETTE.gain },
      ];
    }
    const ref = Math.max(cash + holdingsCostBasis, 0.0001);
    return [
      { name: "Cash", value: cash / ref, color: PALETTE.cash },
      { name: "Holdings", value: holdingsValue / ref, color: PALETTE.holdingsValue },
      { name: "Loss", value: Math.abs(holdingsPnL) / ref, color: PALETTE.loss },
    ];
  }, [cash, holdingsValue, holdingsCostBasis, holdingsPnL, isProfitable, totalBalance]);

  const accountBreakdown = useMemo(() => {
    const bySymbol = new Map(stocks.map((stock) => [stock.symbol, stock]));
    const accountMap = new Map<string, { account: string; value: number; costBasis: number; cash: number }>();

    const addToAccount = (account: string, value = 0, costBasis = 0, cash = 0) => {
      if (value <= 0 && costBasis <= 0 && cash <= 0) return;
      const existing = accountMap.get(account) ?? { account, value: 0, costBasis: 0, cash: 0 };
      existing.value += value;
      existing.costBasis += costBasis;
      existing.cash += cash;
      accountMap.set(account, existing);
    };

    for (const [symbol, lots] of Object.entries(lotsBySymbol)) {
      if (isCashSymbol(symbol)) continue;
      const stock = bySymbol.get(symbol);
      if (!stock || stock.quantity <= 0) continue;

      const price = stock.lastPrice ?? 0;
      const averageCost = Number(stock.averageCost) || 0;
      let remainingQty = Number(stock.quantity) || 0;

      for (const lot of lots.open ?? []) {
        if (remainingQty <= 1e-6) break;

        const account = displayAccount(lot.account);
        const rawLotQty = Number(lot.quantity) || 0;
        const lotCost = Number(lot.costBasis) || 0;
        const lotQty = Math.min(rawLotQty, remainingQty);
        if (lotQty <= 1e-6) continue;

        const currentValue = lotQty * price;
        addToAccount(account, currentValue, lotQty * lotCost);
        remainingQty -= lotQty;
      }

      if (remainingQty > 1e-6) {
        addToAccount(displayAccount(null), remainingQty * price, remainingQty * averageCost);
      }
    }

    for (const [account, amount] of Object.entries(cashByAccount(lotsBySymbol["$CASH"]))) {
      addToAccount(account, 0, 0, amount);
    }

    const allRows = Array.from(accountMap.values())
      .filter((item) => item.value > 0 || item.costBasis > 0 || item.cash > 0)
      .sort((a, b) => b.value + b.cash - (a.value + a.cash));

    const total = allRows.reduce((sum, row) => sum + row.value, 0);
    const cashTotal = allRows.reduce((sum, row) => sum + row.cash, 0);
    if (allRows.length < 2) {
      return null;
    }

    const topRows = allRows.slice(0, 5);
    const remaining = allRows.slice(5);
    const otherValue = remaining.reduce((sum, row) => sum + row.value, 0);
    const otherCost = remaining.reduce((sum, row) => sum + row.costBasis, 0);
    const otherCash = remaining.reduce((sum, row) => sum + row.cash, 0);

    const rows = remaining.length > 0
      ? [...topRows, { account: "Other", value: otherValue, costBasis: otherCost, cash: otherCash }]
      : topRows;

    const segments = rows.map((row, index) => {
      return {
        name: row.account,
        value: row.value,
        color: ACCOUNT_COLORS[index % ACCOUNT_COLORS.length],
      };
    });

    return { rows, segments, total, cashTotal };
  }, [lotsBySymbol, stocks]);

  const gainers = useMemo(
    () =>
      [...held]
        .filter((s) => s.lastPrice && s.lastPrice > s.averageCost)
        .sort((a, b) => (b.lastPrice! - b.averageCost) * b.quantity - (a.lastPrice! - a.averageCost) * a.quantity),
    [held]
  );
  const losers = useMemo(
    () =>
      [...held]
        .filter((s) => s.lastPrice && s.lastPrice < s.averageCost)
        .sort((a, b) => (a.lastPrice! - a.averageCost) * a.quantity - (b.lastPrice! - b.averageCost) * b.quantity),
    [held]
  );

  const totalGainerCostBasis = useMemo(() => gainers.reduce((a, s) => a + s.quantity * s.averageCost, 0), [gainers]);
  const totalLoserCostBasis = useMemo(() => losers.reduce((a, s) => a + s.quantity * s.averageCost, 0), [losers]);

  const pendingRecs = stocks.filter((s) => {
    const a = s.recommendation?.action ?? "";
    return a && !a.startsWith("WAIT");
  });

  useEffect(() => {
    let cancelled = false;
    // Don't null-reset — cached state keeps today's change visible while refreshing

    async function run() {
      if (!hasSupabaseConfig()) {
        if (!cancelled) setCloudHistory([]);
        return;
      }
      try {
        const supabase = createClient();
        // Fast path: PortfolioCloudBridge writes dataUserId to sessionStorage on every mount.
        // Use it directly to skip the auth.getUser() + resolveStocksPmDataUserId() round-trips.
        const cachedDataUserId =
          typeof sessionStorage !== "undefined"
            ? sessionStorage.getItem("stocks-pm-active-data-user-id")
            : null;
        if (cachedDataUserId) {
          const rows = await fetchCloudNetWorthHistory(supabase, cachedDataUserId);
          if (!cancelled) {
            setCloudHistory(rows);
            try { localStorage.setItem("dash_chart_cloudPts", JSON.stringify(rows)); } catch { /* quota */ }
          }
          return;
        }
        // Fallback: full auth waterfall (first page load before PortfolioCloudBridge has run)
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) {
          return;
        }
        const dataUserId = await resolveStocksPmDataUserId(supabase, uid);
        const rows = await fetchCloudNetWorthHistory(supabase, dataUserId);
        if (!cancelled) {
          setCloudHistory(rows);
          try { localStorage.setItem("dash_chart_cloudPts", JSON.stringify(rows)); } catch { /* quota */ }
        }
      } catch {
        // Keep cached data on error — don't blank today's change
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-5">
      <motion.div
        className="flex flex-wrap items-center justify-between gap-3"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <div className="flex flex-wrap gap-2">
          {pendingRecs.length > 0 && (
            <Link
              href="/portfolio"
              className="ui-hover-pop relative rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-foreground shadow-sm dark:border-primary/35 dark:bg-primary/15"
            >
              Recommendations
              <span
                className={appCtaButton(
                  "absolute -right-1 -top-1 h-5 min-w-5 px-0.5 text-[10px] font-bold leading-none"
                )}
              >
                {pendingRecs.length}
              </span>
            </Link>
          )}
          <Link
            href="/settings"
            className="ui-hover-pop rounded-lg border border-border bg-elevated/95 px-3 py-2 text-sm font-medium text-foreground shadow-sm backdrop-blur-sm dark:border-border dark:bg-white/5"
          >
            Settings
          </Link>
        </div>
      </motion.div>

      <motion.section
        className="dashboard-panel p-5 text-foreground sm:p-6"
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1], delay: reduceMotion ? 0 : 0.05 }}
      >
        <h2 className="text-base font-semibold tracking-tight">Portfolio summary</h2>
        <div className="mt-5 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-6 lg:min-w-0 lg:flex-1 lg:justify-start">
            <motion.div
              className="shrink-0"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 22, mass: 0.8, delay: reduceMotion ? 0 : 0.08 }}
            >
              <PortfolioDonut
                segments={pieData.map((p) => ({ name: p.name, value: p.value, color: p.color }))}
                totalValue={formatCurrency(totalBalance)}
                totalLabelClassName="text-[color:var(--dashboard-chart-center-text)]"
                totalValueClassName="text-[color:var(--dashboard-chart-center-text)]"
              />
            </motion.div>
            <ul className="min-w-[9rem] max-w-xs flex-1 space-y-2 text-left sm:min-w-[10.5rem]" aria-label="Allocation breakdown">
              {pieData.map((p) => {
                const pct = p.value * 100;
                const pctLabel = pct < 0.5 && pct > 0 ? "<1%" : `${Math.round(pct)}%`;
                const segmentValue =
                  p.name === "Cash"
                    ? cash
                    : p.name === "Cost" || p.name === "Cost basis"
                      ? holdingsCostBasis
                      : p.name === "Gain"
                        ? Math.max(holdingsPnL, 0)
                        : p.name === "Holdings"
                          ? holdingsValue
                          : p.name === "Loss"
                            ? Math.abs(holdingsPnL)
                            : 0;
                return (
                  <li key={p.name} className="flex items-center gap-2.5 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-inset ring-foreground/12 dark:ring-white/15"
                      style={{ backgroundColor: p.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{p.name}</span>
                    <span className="shrink-0 tabular-nums text-subtle">{formatCompactCurrency(segmentValue)} · {pctLabel}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <dl className="grid w-full max-w-lg grid-cols-1 gap-0 lg:shrink-0">
            <StatRow
              label="Cash"
              value={formatCurrency(cash)}
              labelClassName="text-[color:var(--dashboard-chart-cash)]"
              valueClassName="text-[color:var(--dashboard-chart-cash)]"
              labelAction={(
                <button
                  type="button"
                  onClick={() => setShowCashEditor(true)}
                  className="ml-[5ch] rounded border border-current px-2 py-0.5 text-[11px] font-semibold leading-none text-[color:var(--dashboard-chart-cash)] hover:bg-foreground/5"
                >
                  Edit
                </button>
              )}
              secondaryLabel="Current value"
              secondaryValue={formatCurrency(holdingsValue)}
              secondaryLabelClassName="text-[color:#14b8a6]"
              secondaryValueClassName="text-[color:#14b8a6]"
              secondarySeparator
            />
            {isProfitable ? (
              <>
                <StatRow
                  label="Cost"
                  value={formatCurrency(holdingsCostBasis)}
                  labelClassName="text-[color:var(--dashboard-chart-cost-basis)]"
                  valueClassName="text-[color:var(--dashboard-chart-cost-basis)]"
                />
                <StatRow
                  label="Gain"
                  value={`${formatCurrency(holdingsPnL)} (${formatAbsPercent(totalPnLPct)})`}
                  labelClassName="text-[color:var(--dashboard-chart-gain)]"
                  valueClassName="font-semibold text-[color:var(--dashboard-chart-gain)]"
                  last={!showTodayChange}
                />
              </>
            ) : (
              <>
                <StatRow
                  label="Cost basis"
                  value={formatCurrency(holdingsCostBasis)}
                  labelClassName="text-[color:var(--dashboard-chart-cost-basis)]"
                  valueClassName="text-[color:var(--dashboard-chart-cost-basis)]"
                />
                <StatRow
                  label="Loss"
                  value={`${formatCurrency(Math.abs(holdingsPnL))} (${formatAbsPercent(totalPnLPct)})`}
                  labelClassName="text-[color:var(--dashboard-chart-loss)]"
                  valueClassName="font-semibold text-[color:var(--dashboard-chart-loss)]"
                  last={!showTodayChange}
                />
              </>
            )}
            {showTodayChange ? (
              <StatRow
                label="Today"
                value={`${formatCurrency(Math.abs(todayChange.change))} (${formatPercent(todayChange.percent, true)})`}
                valueClassName={todayValueClassName}
                last
              />
            ) : null}
          </dl>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-subtle">
          {showTodayChange
            ? todayQuoteChange.hasBaseline
              ? "Today is calculated from live quote changes against each holding's previous close."
              : "Today falls back to your latest saved portfolio snapshot before today in U.S. Eastern time when live quote deltas are unavailable."
            : todayStatusLoading
              ? "Loading quote deltas and portfolio history for today's change…"
              : "Today's change value is shown on U.S. trading days from 8:00 AM ET once live quote deltas or a prior portfolio snapshot is available."}
        </p>
      </motion.section>

      {accountBreakdown ? (
        <motion.section
          className="dashboard-panel p-5 text-foreground sm:p-6"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1], delay: reduceMotion ? 0 : 0.08 }}
        >
          <h2 className="text-base font-semibold tracking-tight">Allocation by account</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-subtle">
            Current holdings grouped by lot account, including cash in each account.
          </p>
          <div className="mt-4 grid gap-3.5 md:grid-cols-2" aria-label="Account allocation breakdown">
            {accountBreakdown.rows.map((row, index) => {
              const rowTotal = row.value + row.cash;
              const pct = (rowTotal / Math.max(accountBreakdown.total + accountBreakdown.cashTotal, 0.0001)) * 100;
              const pnl = row.value - row.costBasis;
              const pnlPct = row.costBasis > 0 ? (pnl / row.costBasis) * 100 : 0;
              const pnlClass = pnl >= 0 ? "text-[color:var(--dashboard-chart-gain)]" : "text-[color:var(--dashboard-chart-loss)]";
              const maxReference = Math.max(
                ...accountBreakdown.rows.map((item) => Math.max(item.value, item.costBasis) + Math.max(0, item.cash)),
                0.0001
              );
              const valueWidthPct = Math.max(0, (row.value / maxReference) * 100);
              const costWidthPct = Math.max(0, (Math.min(row.costBasis, row.value) / maxReference) * 100);
              const profitWidthPct = pnl > 0 ? (pnl / maxReference) * 100 : 0;
              const lossWidthPct = pnl < 0 ? (Math.abs(pnl) / maxReference) * 100 : 0;
              const cashWidthPct = Math.max(0, (row.cash / maxReference) * 100);
              const holdingsSpanPct = Math.max(valueWidthPct, costWidthPct + profitWidthPct, valueWidthPct + lossWidthPct);
              const cashOriginPct = holdingsSpanPct;
              const usedPct = Math.min(100, Math.max(0, holdingsSpanPct + cashWidthPct));
              const innerScale = usedPct > 0.0001 ? 100 / usedPct : 1;

              return (
                <div key={`${row.account}-${index}`} className="text-sm">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="min-w-0 truncate font-medium text-foreground">
                      {row.account}
                    </span>
                    <span className="shrink-0 tabular-nums font-medium text-foreground">
                      {`${formatCurrency(rowTotal)} (${Math.round(pct)}%)`}
                    </span>
                  </div>

                  <div className="relative mt-1 h-6">
                    {usedPct > 0 ? (
                      <div className="relative h-6 overflow-hidden" style={{ width: `${usedPct}%` }}>
                    <div
                      className="absolute inset-y-0 left-0 rounded-none"
                      style={{
                        width: `${Math.min(100, valueWidthPct * innerScale)}%`,
                        backgroundColor: CURRENT_VALUE_COLOR,
                      }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 rounded-none"
                      style={{
                        width: `${Math.min(100, costWidthPct * innerScale)}%`,
                        backgroundColor: "var(--dashboard-chart-cost-basis)",
                      }}
                    />
                    {profitWidthPct > 0 ? (
                      <div
                        className="absolute inset-y-0 rounded-none"
                        style={{
                          left: `${Math.min(100, costWidthPct * innerScale)}%`,
                          width: `${Math.min(100 - costWidthPct * innerScale, profitWidthPct * innerScale)}%`,
                          backgroundColor: "var(--dashboard-chart-gain)",
                        }}
                      />
                    ) : null}
                    {lossWidthPct > 0 ? (
                      <div
                        className="absolute inset-y-0 rounded-none"
                        style={{
                          left: `${Math.min(100, valueWidthPct * innerScale)}%`,
                          width: `${Math.min(100 - valueWidthPct * innerScale, lossWidthPct * innerScale)}%`,
                          backgroundColor: "var(--dashboard-chart-loss)",
                        }}
                      />
                    ) : null}
                    {cashWidthPct > 0 ? (
                      <div
                        className="absolute inset-y-0 rounded-none"
                        style={{
                          left: `${Math.min(100, cashOriginPct * innerScale)}%`,
                          width: `${Math.min(100 - cashOriginPct * innerScale, cashWidthPct * innerScale)}%`,
                          backgroundColor: "var(--dashboard-chart-cash)",
                        }}
                      />
                    ) : null}
                    {[
                      profitWidthPct > 0 ? costWidthPct * innerScale : null,
                      lossWidthPct > 0 ? valueWidthPct * innerScale : null,
                      cashWidthPct > 0 ? cashOriginPct * innerScale : null,
                    ]
                      .filter((mark): mark is number => mark != null && mark > 0 && mark < 100)
                      .map((mark, separatorIndex) => (
                        <div
                          key={`separator-${separatorIndex}-${mark.toFixed(2)}`}
                          className="absolute top-1/2 h-6 w-px -translate-y-1/2 bg-white/95 dark:bg-black/95"
                          style={{ left: `calc(${mark}% - 0.5px)` }}
                        />
                      ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-1.5 truncate text-[11px] tabular-nums text-subtle">
                    <span className="font-bold text-[color:var(--dashboard-chart-cost-basis)]">Cost {formatCurrency(row.costBasis)}</span>
                    {" · "}
                    <span className={`${pnlClass} font-bold`}>P/L {formatCurrency(pnl)} ({`${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%`})</span>
                    {" · "}
                    <span className="font-bold text-[color:var(--dashboard-chart-cash)]">Cash {formatCurrency(row.cash)}</span>
                  </div>

                </div>
              );
            })}
          </div>
        </motion.section>
      ) : null}

      <RecommendedActionsWidget stocks={stocks} />

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1], delay: reduceMotion ? 0 : 0.1 }}
      >
        <DashboardReturnComparison />
      </motion.div>

      <motion.section
        className="dashboard-panel p-5 text-foreground sm:p-6"
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1], delay: reduceMotion ? 0 : 0.15 }}
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight">Your Holdings - Gainers/Losers</h2>
          <label className="ui-hover-pop flex cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2 py-1 text-xs text-subtle transition-colors hover:border-border">
            <span className="font-medium">{bars ? "Bars" : "Heat map"}</span>
            <input type="checkbox" className="accent-primary" checked={bars} onChange={(e) => setBars(e.target.checked)} />
          </label>
        </div>

        <AnimatePresence mode="wait">
          {!bars ? (
            <motion.div
              key="heatmap"
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <HoldingsHeatmap
                gainers={gainers}
                losers={losers}
                selectedSymbol={dashStockDetail}
                onToggleSymbol={(sym) => setDashStockDetail((x) => (x === sym ? null : sym))}
              />
            </motion.div>
          ) : (
            <motion.div
              key="bars"
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="grid gap-8 sm:grid-cols-2"
            >
              <GainerLoserBars
                gainers={gainers}
                losers={losers}
                totalGainerCb={totalGainerCostBasis}
                totalLoserCb={totalLoserCostBasis}
                selectedSymbol={dashStockDetail}
                onToggleSymbol={(sym) => setDashStockDetail((x) => (x === sym ? null : sym))}
              />
            </motion.div>
          )}
        </AnimatePresence>
        {dashStockDetail ? (
          <div className="mt-6">
            <StockDetailExpandPanel symbol={dashStockDetail} embedded onClose={() => setDashStockDetail(null)} />
          </div>
        ) : null}
      </motion.section>
      <CashAccountsEditor open={showCashEditor} onClose={() => setShowCashEditor(false)} />
    </div>
  );
}

function StatRow({
  label,
  value,
  labelClassName,
  valueClassName,
  labelAction,
  secondaryLabel,
  secondaryValue,
  secondaryLabelClassName,
  secondaryValueClassName,
  secondarySeparator,
  last,
}: {
  label: string;
  value: string;
  labelClassName?: string;
  valueClassName?: string;
  labelAction?: ReactNode;
  secondaryLabel?: string;
  secondaryValue?: string;
  secondaryLabelClassName?: string;
  secondaryValueClassName?: string;
  secondarySeparator?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-2.5 ${
        last ? "" : "border-b border-border/90 dark:border-foreground/10"
      }`}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <dt className={`flex items-center text-sm font-medium ${labelClassName ?? "text-subtle"}`}>
          <span>{label}</span>
          {labelAction}
        </dt>
        {secondaryLabel ? (
          <dt
            className={`text-sm font-medium ${secondaryLabelClassName ?? "text-subtle"} ${
              secondarySeparator ? "border-t border-border/80 pt-1.5 dark:border-foreground/10" : ""
            }`}
          >
            {secondaryLabel}
          </dt>
        ) : null}
      </div>
      <div className="space-y-1 text-right">
        <dd className={`text-sm tabular-nums ${valueClassName ?? "text-subtle"}`}>{value}</dd>
        {secondaryValue ? (
          <dd
            className={`text-sm tabular-nums ${secondaryValueClassName ?? "text-subtle"} ${
              secondarySeparator ? "border-t border-border/80 pt-1.5 dark:border-foreground/10" : ""
            }`}
          >
            {secondaryValue}
          </dd>
        ) : null}
      </div>
    </div>
  );
}

type Row = {
  symbol: string;
  quantity: number;
  averageCost: number;
  lastPrice?: number;
};

function EmptyCol({ message, sub }: { message: string; sub: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/50 px-4 py-8 text-center dark:border-foreground/15 dark:bg-white/5">
      <p className="text-sm font-medium text-foreground">{message}</p>
      <p className="mt-1 max-w-[14rem] text-xs leading-snug text-subtle">{sub}</p>
    </div>
  );
}

function fmtShort(n: number) {
  return formatCompactNumber(n);
}

const HEATMAP_SIDE_PX = 600;

type HeatmapItem = {
  symbol: string;
  weight: number;
  pnl: number;
  pnlPercent: number;
  costBasis: number;
};

type HeatmapTile = HeatmapItem & { x: number; y: number; width: number; height: number };

function layoutHeatmapTiles(items: HeatmapItem[], size: number, gap = 2): HeatmapTile[] {
  const filtered = items.filter((i) => i.weight > 0).sort((a, b) => b.weight - a.weight);
  if (filtered.length === 0 || size <= 1) return [];

  const split = (list: HeatmapItem[], x: number, y: number, w: number, h: number): HeatmapTile[] => {
    if (list.length === 0) return [];
    if (list.length === 1) {
      return [
        {
          ...list[0],
          x: x + gap / 2,
          y: y + gap / 2,
          width: Math.max(0, w - gap),
          height: Math.max(0, h - gap),
        },
      ];
    }
    const total = list.reduce((sum, item) => sum + item.weight, 0);
    let running = 0;
    let index = 0;
    for (let i = 0; i < list.length; i++) {
      running += list[i].weight;
      index = i;
      if (running >= total * 0.5) break;
    }
    const splitIndex = Math.min(Math.max(index, 0), list.length - 2);
    const left = list.slice(0, splitIndex + 1);
    const right = list.slice(splitIndex + 1);
    const leftWeight = left.reduce((sum, item) => sum + item.weight, 0);
    const frac = leftWeight / Math.max(total, 0.0001);
    if (w >= h) {
      const w1 = w * frac;
      return [...split(left, x, y, w1, h), ...split(right, x + w1, y, w - w1, h)];
    }
    const h1 = h * frac;
    return [...split(left, x, y, w, h1), ...split(right, x, y + h1, w, h - h1)];
  };

  return split(filtered, 0, 0, size, size);
}

function HoldingsHeatmap({
  gainers,
  losers,
  selectedSymbol,
  onToggleSymbol,
}: {
  gainers: Row[];
  losers: Row[];
  selectedSymbol: string | null;
  onToggleSymbol: (symbol: string) => void;
}) {
  const items = useMemo<HeatmapItem[]>(() => {
    return [...gainers, ...losers].map((s) => {
      const costBasis = Math.max(s.quantity * s.averageCost, 0);
      const current = s.quantity * (s.lastPrice ?? s.averageCost);
      const pnl = current - costBasis;
      return {
        symbol: s.symbol,
        weight: Math.max(costBasis, 0.0001),
        pnl,
        pnlPercent: costBasis > 0 ? (pnl / costBasis) * 100 : 0,
        costBasis,
      };
    });
  }, [gainers, losers]);

  const tiles = useMemo(() => layoutHeatmapTiles(items, HEATMAP_SIDE_PX), [items]);

  if (items.length === 0) {
    return <p className="text-xs text-subtle">No holdings to map.</p>;
  }

  return (
    <div className="mx-auto w-full max-w-[600px]">
      <div className="relative aspect-square w-full overflow-hidden rounded-[10px]">
        {tiles.map((tile) => {
          const intensity = Math.min(1, Math.abs(tile.pnlPercent) / 25);
          const colorVar = tile.pnl >= 0 ? "var(--dashboard-chart-gain)" : "var(--dashboard-chart-loss)";
          const mix = 45 + 55 * intensity;
          const showPercent = tile.height >= 36 && tile.width >= 44;
          const showAmount = tile.height >= 54 && tile.width >= 56;
          const selected = selectedSymbol === tile.symbol;
          return (
            <button
              key={tile.symbol}
              type="button"
              onClick={() => onToggleSymbol(tile.symbol)}
              className={`absolute overflow-hidden p-1.5 text-left text-white ${
                selected ? "z-10 ring-2 ring-white ring-offset-1 ring-offset-background" : ""
              }`}
              style={{
                left: `${(tile.x / HEATMAP_SIDE_PX) * 100}%`,
                top: `${(tile.y / HEATMAP_SIDE_PX) * 100}%`,
                width: `${(tile.width / HEATMAP_SIDE_PX) * 100}%`,
                height: `${(tile.height / HEATMAP_SIDE_PX) * 100}%`,
                backgroundColor: `color-mix(in srgb, ${colorVar} ${mix}%, #111827)`,
              }}
            >
              <div className="text-[11px] font-bold leading-tight sm:text-xs">{tile.symbol}</div>
              {showPercent ? (
                <div className="text-[10px] font-semibold tabular-nums text-white/95">
                  {`${tile.pnlPercent >= 0 ? "+" : ""}${Math.round(tile.pnlPercent)}%`}
                </div>
              ) : null}
              {showAmount ? (
                <div className="text-[10px] tabular-nums text-white/90">
                  {`${tile.pnl < 0 ? "-" : ""}${fmtShort(Math.abs(tile.pnl))}`}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GainerLoserBars({
  gainers,
  losers,
  totalGainerCb,
  totalLoserCb,
  selectedSymbol,
  onToggleSymbol,
}: {
  gainers: Row[];
  losers: Row[];
  totalGainerCb: number;
  totalLoserCb: number;
  selectedSymbol: string | null;
  onToggleSymbol: (symbol: string) => void;
}) {
  const sortedG = [...gainers].sort((a, b) => b.quantity * b.averageCost - a.quantity * a.averageCost);
  const sortedL = [...losers].sort((a, b) => b.quantity * b.averageCost - a.quantity * a.averageCost);

  const maxCostG = Math.max(...sortedG.map((g) => g.quantity * g.averageCost), 1);
  const maxCostL = Math.max(...sortedL.map((l) => l.quantity * l.averageCost), 1);
  // Use one cost-basis scale across gainers and losers so similar CB values look similar in height.
  const sharedScaleMax = Math.max(maxCostG, maxCostL, 1);

  return (
    <>
      <div>
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <h3 className="text-sm font-semibold text-[color:var(--dashboard-chart-gain)]">Gainers</h3>
          <span className="text-xs text-subtle">Cost basis {fmtShort(totalGainerCb)}</span>
        </div>
        {sortedG.length === 0 ? (
          <EmptyCol message="No gainers to chart." sub="Switch to cards or add positions." />
        ) : (
          <div className="flex h-44 flex-nowrap items-end gap-2 overflow-x-auto pb-1" style={{ scrollbarGutter: "stable" }}>
            {sortedG.map((g) => {
              const costBasis = Math.max(g.quantity * g.averageCost, 0.0001);
              const gain = Math.max((g.lastPrice ?? g.averageCost) * g.quantity - costBasis, 0);
              const total = costBasis + gain;
              const scaled = costBasis / sharedScaleMax;
              const barH = 128 * scaled;
              const costH = barH * (costBasis / total);
              const gainH = barH * (gain / total);
              return (
                <button
                  key={g.symbol}
                  type="button"
                  onClick={() => onToggleSymbol(g.symbol)}
                  className={`ui-hover-pop flex w-10 flex-col items-center gap-1 rounded-md ${
                    selectedSymbol === g.symbol ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
                  }`}
                >
                  <span className="text-[9px] font-bold tabular-nums text-[color:var(--dashboard-chart-gain)]">{fmtShort(gain)}</span>
                  <div className="flex w-9 flex-col justify-end overflow-hidden rounded-md shadow-sm" style={{ height: barH }}>
                    <div
                      className="w-full transition-all duration-500"
                      style={{
                        height: gainH,
                        backgroundColor: "color-mix(in srgb, var(--dashboard-chart-gain) 84%, var(--theme-surface-elevated))",
                      }}
                    />
                    <div
                      className="w-full"
                      style={{
                        height: costH,
                        backgroundColor: "color-mix(in srgb, var(--dashboard-chart-cost-basis) 78%, var(--theme-surface-elevated))",
                      }}
                    />
                  </div>
                  <span className="text-[8px] font-medium tabular-nums text-subtle">{fmtShort(costBasis)}</span>
                  <span className="text-[8px] font-semibold text-foreground">{g.symbol}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div>
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <h3 className="text-sm font-semibold text-[color:var(--dashboard-chart-loss)]">Losers</h3>
          <span className="text-xs text-subtle">Cost basis {fmtShort(totalLoserCb)}</span>
        </div>
        {sortedL.length === 0 ? (
          <EmptyCol message="No losers to chart." sub="Switch to cards or add positions." />
        ) : (
          <div className="flex h-44 flex-nowrap items-end gap-2 overflow-x-auto pb-1" style={{ scrollbarGutter: "stable" }}>
            {sortedL.map((l) => {
              const costBasis = Math.max(l.quantity * l.averageCost, 0.0001);
              const loss = Math.abs((l.lastPrice ?? l.averageCost) * l.quantity - costBasis);
              const currentValue = Math.max(costBasis - loss, 0);
              const scaledCost = costBasis / sharedScaleMax;
              const barH = 128 * scaledCost;
              const curH = barH * (currentValue / costBasis);
              const lossH = barH * (loss / costBasis);
              return (
                <button
                  key={l.symbol}
                  type="button"
                  onClick={() => onToggleSymbol(l.symbol)}
                  className={`ui-hover-pop flex w-10 flex-col items-center gap-1 rounded-md ${
                    selectedSymbol === l.symbol
                      ? "ring-2 ring-[color:var(--dashboard-chart-loss)] ring-offset-2 ring-offset-background"
                      : ""
                  }`}
                >
                  <span className="text-[9px] font-bold tabular-nums text-[color:var(--dashboard-chart-loss)]">{fmtShort(loss)}</span>
                  <div className="flex w-9 flex-col justify-end overflow-hidden rounded-md shadow-sm" style={{ height: barH }}>
                    <div
                      className="w-full transition-all duration-500"
                      style={{
                        height: lossH,
                        backgroundColor: "color-mix(in srgb, var(--dashboard-chart-loss) 82%, var(--theme-surface-elevated))",
                      }}
                    />
                    <div
                      className="w-full"
                      style={{
                        height: curH,
                        backgroundColor: "color-mix(in srgb, var(--dashboard-chart-cost-basis) 78%, var(--theme-surface-elevated))",
                      }}
                    />
                  </div>
                  <span className="text-[8px] font-medium tabular-nums text-subtle">{fmtShort(costBasis)}</span>
                  <span className="text-[8px] font-semibold text-foreground">{l.symbol}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
