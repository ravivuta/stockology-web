"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { TrendingDown, TrendingUp } from "lucide-react";
import { appCtaButton } from "@/lib/appCtaClasses";
import { usePortfolioStore } from "@/store/portfolioStore";
import { PortfolioDonut } from "@/components/dashboard/PortfolioDonut";
import { StockDetailExpandPanel } from "@/components/stock/StockDetailExpandPanel";
import { RecommendedActionsWidget } from "@/components/dashboard/RecommendedActionsWidget";
import { DashboardReturnComparison } from "@/components/dashboard/DashboardReturnComparison";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { resolveStocksPmDataUserId } from "@/lib/resolve-stocks-pm-data-user-id";
import {
  computeTodayChangeFromHistory,
  computeTodayChangeFromLiveQuotes,
  fetchCloudNetWorthHistory,
  type NetWorthPoint,
} from "@/lib/portfolio-net-worth-series";
import { isUsMarketTradingDay } from "@/lib/market-hours";
import { formatAbsPercent, formatCompactCurrency, formatCurrency, formatPercent } from "@/lib/numberFormat";

const PALETTE = {
  cash: "var(--dashboard-chart-cash)",
  costBasis: "var(--dashboard-chart-cost-basis)",
  gain: "var(--dashboard-chart-gain)",
  holdingsValue: "var(--dashboard-chart-holdings)",
  loss: "var(--dashboard-chart-loss)",
} as const;

const ACCOUNT_COLORS = [
  "#eab308",
  "#3f4650",
  "#f7c948",
  "#4b5563",
  "#d99a00",
  "#374151",
  "#f8d66a",
] as const;

export default function DashboardPage() {
  const reduceMotion = useReducedMotion();
  const stocks = usePortfolioStore((s) => s.stocks);
  const cash = usePortfolioStore((s) => s.cashBalance);
  const lotsBySymbol = usePortfolioStore((s) => s.lotsBySymbol);
  const [bars, setBars] = useState(true);
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

  const held = useMemo(() => stocks.filter((s) => s.quantity > 0), [stocks]);
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
  const todayQuoteChange = useMemo(() => computeTodayChangeFromLiveQuotes(stocks, cash), [stocks, cash]);
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
    const accountMap = new Map<string, { account: string; value: number; costBasis: number }>();

    const addToAccount = (account: string, value: number, costBasis: number) => {
      if (value <= 0 && costBasis <= 0) return;
      const existing = accountMap.get(account) ?? { account, value: 0, costBasis: 0 };
      existing.value += value;
      existing.costBasis += costBasis;
      accountMap.set(account, existing);
    };

    for (const [symbol, lots] of Object.entries(lotsBySymbol)) {
      const stock = bySymbol.get(symbol);
      if (!stock || stock.quantity <= 0) continue;

      const price = stock.lastPrice ?? 0;
      const averageCost = Number(stock.averageCost) || 0;
      let remainingQty = Number(stock.quantity) || 0;

      for (const lot of lots.open ?? []) {
        if (remainingQty <= 1e-6) break;

        const account = lot.account?.trim() || "Unassigned";
        const rawLotQty = Number(lot.quantity) || 0;
        const lotCost = Number(lot.costBasis) || 0;
        const lotQty = Math.min(rawLotQty, remainingQty);
        if (lotQty <= 1e-6) continue;

        const currentValue = lotQty * price;
        addToAccount(account, currentValue, lotQty * lotCost);
        remainingQty -= lotQty;
      }

      if (remainingQty > 1e-6) {
        addToAccount("Unassigned", remainingQty * price, remainingQty * averageCost);
      }
    }

    const allRows = Array.from(accountMap.values())
      .filter((item) => item.value > 0 || item.costBasis > 0)
      .sort((a, b) => b.value - a.value);

    const total = allRows.reduce((sum, row) => sum + row.value, 0);
    if (allRows.length < 2 || total <= 0) {
      return null;
    }

    const topRows = allRows.slice(0, 5);
    const remaining = allRows.slice(5);
    const otherValue = remaining.reduce((sum, row) => sum + row.value, 0);
    const otherCost = remaining.reduce((sum, row) => sum + row.costBasis, 0);

    const rows = otherValue > 0
      ? [...topRows, { account: "Other", value: otherValue, costBasis: otherCost }]
      : topRows;

    const segments = rows.map((row, index) => {
      return {
        name: row.account,
        value: row.value,
        color: ACCOUNT_COLORS[index % ACCOUNT_COLORS.length],
      };
    });

    return { rows, segments, total };
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
          if (!cancelled) setCloudHistory([]);
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
                return (
                  <li key={p.name} className="flex items-center gap-2.5 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-inset ring-foreground/12 dark:ring-white/15"
                      style={{ backgroundColor: p.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{p.name}</span>
                    <span className="shrink-0 tabular-nums text-subtle">{pctLabel}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <dl className="grid w-full max-w-lg grid-cols-1 gap-0 lg:shrink-0">
            <StatRow label="Cash" value={formatCurrency(cash)} valueClassName="text-[color:var(--dashboard-chart-cash)]" />
            {isProfitable ? (
              <>
                <StatRow
                  label="Cost"
                  value={formatCurrency(holdingsCostBasis)}
                  valueClassName="text-[color:var(--dashboard-chart-cost-basis)]"
                />
                <StatRow
                  label="Gain"
                  value={`${formatCurrency(holdingsPnL)} (${formatAbsPercent(totalPnLPct)})`}
                  valueClassName="font-semibold text-[color:var(--dashboard-chart-gain)]"
                  last={!showTodayChange}
                />
              </>
            ) : (
              <>
                <StatRow
                  label="Cost basis"
                  value={formatCurrency(holdingsCostBasis)}
                  valueClassName="text-[color:var(--dashboard-chart-cost-basis)]"
                />
                <StatRow
                  label="Current value"
                  value={formatCurrency(holdingsValue)}
                  valueClassName="text-[color:var(--dashboard-chart-holdings)]"
                />
                <StatRow
                  label="Loss"
                  value={`${formatCurrency(Math.abs(holdingsPnL))} (${formatAbsPercent(totalPnLPct)})`}
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
              : "Today is shown on U.S. trading days from 8:00 AM ET once live quote deltas or a prior portfolio snapshot is available."}
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
            Current holdings grouped by lot account. Cash is excluded from this chart.
          </p>
          <div className="mt-4 flex flex-col gap-7 sm:flex-row sm:items-center sm:justify-between">
            <ul className="min-w-0 flex-1 space-y-2.5 text-left" aria-label="Account allocation breakdown">
              {accountBreakdown.rows.map((row, index) => {
                const pct = (row.value / Math.max(accountBreakdown.total, 0.0001)) * 100;
                const pnl = row.value - row.costBasis;
                const pnlClass = pnl >= 0 ? "text-[color:var(--dashboard-chart-gain)]" : "text-[color:var(--dashboard-chart-loss)]";
                const pctLabel = pct < 0.5 && pct > 0 ? "<1%" : `${Math.round(pct)}%`;
                return (
                  <li key={`${row.account}-${index}`} className="text-sm">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-inset ring-foreground/12 dark:ring-white/15"
                        style={{ backgroundColor: accountBreakdown.segments[index]?.color }}
                        aria-hidden
                      />
                      <span
                        className="min-w-0 flex-1 truncate font-medium"
                        style={{ color: accountBreakdown.segments[index]?.color }}
                      >
                        {row.account}
                      </span>
                      <span className="shrink-0 tabular-nums font-bold text-foreground">{formatCompactCurrency(row.value)}</span>
                      <span className="shrink-0 tabular-nums font-bold text-subtle">{pctLabel}</span>
                    </div>
                    <div className="ml-5 mt-0.5 text-[11px] tabular-nums text-subtle">
                      <span className="font-bold text-[color:var(--dashboard-chart-cost-basis)]">Cost {formatCompactCurrency(row.costBasis)}</span> · <span className={`${pnlClass} font-bold`}>P/L {formatCompactCurrency(pnl)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <PortfolioDonut
              segments={accountBreakdown.segments}
              totalLabel="Holdings"
              totalValue={formatCurrency(accountBreakdown.total)}
              totalLabelClassName="text-[color:var(--dashboard-chart-center-text)]"
              totalValueClassName="text-[color:var(--dashboard-chart-center-text)]"
            />
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
          <h2 className="text-base font-semibold tracking-tight">Top investments</h2>
          <label className="ui-hover-pop flex cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2 py-1 text-xs text-subtle transition-colors hover:border-border">
            <span className="font-medium">{bars ? "Bars" : "Cards"}</span>
            <input type="checkbox" className="accent-primary" checked={bars} onChange={(e) => setBars(e.target.checked)} />
          </label>
        </div>

        <AnimatePresence mode="wait">
          {!bars ? (
            <motion.div
              key="cards"
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="grid gap-8 sm:grid-cols-2"
            >
              <GainerLoserCards
                gainers={gainers}
                losers={losers}
                totalGainerCb={totalGainerCostBasis}
                totalLoserCb={totalLoserCostBasis}
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
    </div>
  );
}

function StatRow({
  label,
  value,
  valueClassName,
  last,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-2.5 ${
        last ? "" : "border-b border-border/90 dark:border-foreground/10"
      }`}
    >
      <dt className="text-sm font-medium text-subtle">{label}</dt>
      <dd className={`text-right text-sm tabular-nums ${valueClassName ?? "text-subtle"}`}>{value}</dd>
    </div>
  );
}

type Row = {
  symbol: string;
  quantity: number;
  averageCost: number;
  lastPrice?: number;
};

function GainerLoserCards({
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
  return (
    <>
      <div className="flex min-h-[140px] flex-col">
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-primary">
            <TrendingUp className="h-4 w-4 opacity-90" aria-hidden />
            Gainers
          </h3>
          <span className="text-xs text-subtle">Cost basis {fmtShort(totalGainerCb)}</span>
        </div>
        <div className="flex flex-1 flex-wrap content-start gap-2">
          {gainers.map((s) => {
            const cost = s.quantity * s.averageCost;
            const cur = s.quantity * (s.lastPrice ?? s.averageCost);
            const gain = cur - cost;
            return (
              <button
                key={s.symbol}
                type="button"
                onClick={() => onToggleSymbol(s.symbol)}
                className={`ui-hover-lift min-w-[7.5rem] rounded-xl border p-3 text-left text-sm shadow-sm transition-colors dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 ${
                  selectedSymbol === s.symbol
                    ? "border-primary/50 bg-primary/10 ring-1 ring-primary/15 dark:bg-primary/15"
                    : "border-border bg-muted/30 hover:border-primary/35 hover:bg-primary/5"
                }`}
              >
                <div className="font-semibold text-foreground">{s.symbol}</div>
                <div className="text-[11px] text-subtle">Cost {fmtShort(cost)}</div>
                <div className="text-[11px] font-semibold text-primary">+{fmtShort(gain)}</div>
              </button>
            );
          })}
          {gainers.length === 0 && <EmptyCol message="No gainers yet." sub="Add holdings or refresh prices to see leaders." />}
        </div>
      </div>
      <div className="flex min-h-[140px] flex-col">
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[color:var(--dashboard-chart-loss)]">
            <TrendingDown className="h-4 w-4 opacity-90" aria-hidden />
            Losers
          </h3>
          <span className="text-xs text-subtle">Cost basis {fmtShort(totalLoserCb)}</span>
        </div>
        <div className="flex flex-1 flex-wrap content-start gap-2">
          {losers.map((s) => {
            const cost = s.quantity * s.averageCost;
            const cur = s.quantity * (s.lastPrice ?? s.averageCost);
            const loss = Math.abs(cur - cost);
            return (
              <button
                key={s.symbol}
                type="button"
                onClick={() => onToggleSymbol(s.symbol)}
                className={`ui-hover-lift min-w-[7.5rem] rounded-xl border p-3 text-left text-sm shadow-sm transition-colors dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 ${
                  selectedSymbol === s.symbol
                    ? "border-[color:var(--dashboard-chart-loss)]/40 bg-[color:var(--dashboard-chart-loss)]/10 dark:bg-[color:var(--dashboard-chart-loss)]/15"
                    : "border-border bg-muted/40 hover:border-[color:var(--dashboard-chart-loss)]/35 hover:bg-[color:var(--dashboard-chart-loss)]/5"
                }`}
              >
                <div className="font-semibold text-foreground">{s.symbol}</div>
                <div className="text-[11px] text-subtle">Cost {fmtShort(cost)}</div>
                <div className="text-[11px] font-semibold text-[color:var(--dashboard-chart-loss)]">−{fmtShort(loss)}</div>
              </button>
            );
          })}
          {losers.length === 0 && <EmptyCol message="No losers yet." sub="Positions at or above cost won’t appear here." />}
        </div>
      </div>
    </>
  );
}

function EmptyCol({ message, sub }: { message: string; sub: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/50 px-4 py-8 text-center dark:border-foreground/15 dark:bg-white/5">
      <p className="text-sm font-medium text-foreground">{message}</p>
      <p className="mt-1 max-w-[14rem] text-xs leading-snug text-subtle">{sub}</p>
    </div>
  );
}

function fmtShort(n: number) {
  return formatCompactCurrency(n);
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
  const sortedG = [...gainers].sort((a, b) => b.quantity * b.averageCost - a.quantity * a.averageCost).slice(0, 8);
  const sortedL = [...losers].sort((a, b) => b.quantity * b.averageCost - a.quantity * a.averageCost).slice(0, 8);

  const maxGain = Math.max(
    ...sortedG.map((g) => Math.max(0, (g.lastPrice ?? g.averageCost) * g.quantity - g.averageCost * g.quantity)),
    1
  );
  const maxCostG = Math.max(...sortedG.map((g) => g.quantity * g.averageCost), 1);
  const maxTotal = maxCostG + maxGain;

  const maxCostL = Math.max(...sortedL.map((l) => l.quantity * l.averageCost), 1);

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
          <div className="flex h-44 flex-wrap items-end gap-2 overflow-x-auto pb-1">
            {sortedG.map((g) => {
              const costBasis = Math.max(g.quantity * g.averageCost, 0.0001);
              const gain = Math.max((g.lastPrice ?? g.averageCost) * g.quantity - costBasis, 0);
              const total = costBasis + gain;
              const scaled = total / maxTotal;
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
          <div className="flex h-44 flex-wrap items-end gap-2 overflow-x-auto pb-1">
            {sortedL.map((l) => {
              const costBasis = Math.max(l.quantity * l.averageCost, 0.0001);
              const loss = Math.abs((l.lastPrice ?? l.averageCost) * l.quantity - costBasis);
              const currentValue = Math.max(costBasis - loss, 0);
              const scaledCost = costBasis / maxCostL;
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
