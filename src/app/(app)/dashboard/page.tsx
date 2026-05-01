"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { appCtaButton } from "@/lib/appCtaClasses";
import { usePortfolioStore } from "@/store/portfolioStore";
import { runRefreshPipeline } from "@/lib/refresh";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { PortfolioDonut } from "@/components/dashboard/PortfolioDonut";
import { StockDetailExpandPanel } from "@/components/stock/StockDetailExpandPanel";
import { RecommendedActionsWidget } from "@/components/dashboard/RecommendedActionsWidget";
import { DashboardReturnComparison } from "@/components/dashboard/DashboardReturnComparison";

const PALETTE = {
  cash: "var(--palette-baby)",
  costBasis: "var(--theme-text-secondary)",
  gain: "var(--theme-primary)",
  holdingsValue: "var(--theme-primary-light)",
  loss: "var(--palette-battleship)",
} as const;

function fmtCurrency(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtPct(n: number, digits = 1) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export default function DashboardPage() {
  const reduceMotion = useReducedMotion();
  const stocks = usePortfolioStore((s) => s.stocks);
  const cash = usePortfolioStore((s) => s.cashBalance);
  const recalc = usePortfolioStore((s) => s.recalcMetrics);
  const [bars, setBars] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dashStockDetail, setDashStockDetail] = useState<string | null>(null);

  const debouncedRecalc = useDebouncedCallback(() => recalc(), 300);

  const held = useMemo(() => stocks.filter((s) => s.quantity > 0), [stocks]);
  const holdingsValue = useMemo(() => held.reduce((a, s) => a + s.quantity * (s.lastPrice ?? 0), 0), [held]);
  const holdingsCostBasis = useMemo(() => held.reduce((a, s) => a + s.quantity * s.averageCost, 0), [held]);
  const holdingsPnL = holdingsValue - holdingsCostBasis;
  const totalBalance = holdingsValue + cash;
  const isProfitable = holdingsPnL >= 0;
  const totalPnLPct = holdingsCostBasis > 0 ? (holdingsPnL / holdingsCostBasis) * 100 : 0;

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

  const gainers = useMemo(
    () =>
      [...held]
        .filter((s) => s.lastPrice && s.lastPrice > s.averageCost)
        .sort((a, b) => (b.lastPrice! - b.averageCost) * b.quantity - (a.lastPrice! - a.averageCost) * a.quantity)
        .slice(0, 8),
    [held]
  );
  const losers = useMemo(
    () =>
      [...held]
        .filter((s) => s.lastPrice && s.lastPrice < s.averageCost)
        .sort((a, b) => (a.lastPrice! - a.averageCost) * a.quantity - (b.lastPrice! - b.averageCost) * b.quantity)
        .slice(0, 8),
    [held]
  );

  const totalGainerCostBasis = useMemo(() => gainers.reduce((a, s) => a + s.quantity * s.averageCost, 0), [gainers]);
  const totalLoserCostBasis = useMemo(() => losers.reduce((a, s) => a + s.quantity * s.averageCost, 0), [losers]);

  const pendingRecs = stocks.filter((s) => {
    const a = s.recommendation?.action ?? "";
    return a && !a.startsWith("WAIT");
  });

  async function manualRefresh() {
    setRefreshing(true);
    await runRefreshPipeline(stocks.map((s) => s.symbol));
    recalc();
    usePortfolioStore.setState({ lastRefreshAt: new Date().toISOString() });
    debouncedRecalc();
    setRefreshing(false);
  }

  return (
    <div className={`space-y-5 ${refreshing ? "dashboard-refresh-pulse" : ""}`}>
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
          <button
            type="button"
            disabled={refreshing}
            onClick={manualRefresh}
            className={appCtaButton(
              "ui-hover-spotlight min-w-[9.5rem] gap-2 px-4 py-2 text-sm shadow-sm disabled:opacity-55"
            )}
          >
            {refreshing ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : null}
            <span>{refreshing ? "Refreshing…" : "Refresh data"}</span>
          </button>
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
                totalValue={fmtCurrency(totalBalance)}
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
            <StatRow label="Cash" value={fmtCurrency(cash)} accent="baby" />
            {isProfitable ? (
              <>
                <StatRow label="Cost" value={fmtCurrency(holdingsCostBasis)} accent="cerulean" />
                <StatRow label="Gain" value={`${fmtCurrency(holdingsPnL)} (${fmtPct(Math.abs(totalPnLPct))})`} accent="yale" last />
              </>
            ) : (
              <>
                <StatRow label="Cost basis" value={fmtCurrency(holdingsCostBasis)} accent="cerulean" />
                <StatRow label="Current value" value={fmtCurrency(holdingsValue)} accent="cerulean" />
                <StatRow
                  label="Loss"
                  value={`${fmtCurrency(Math.abs(holdingsPnL))} (${fmtPct(Math.abs(totalPnLPct))})`}
                  accent="battleship"
                  last
                />
              </>
            )}
          </dl>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-subtle">
          Today vs prior close: — (uses U.S. market calendar when price history is available)
        </p>
      </motion.section>

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
  accent,
  last,
}: {
  label: string;
  value: string;
  accent: "baby" | "cerulean" | "yale" | "battleship";
  last?: boolean;
}) {
  const valueClass =
    accent === "baby"
      ? "text-primary"
      : accent === "cerulean"
        ? "text-subtle"
        : accent === "yale"
          ? "font-semibold text-primary"
          : "text-subtle";
  return (
    <div
      className={`flex items-baseline justify-between gap-4 py-2.5 ${
        last ? "" : "border-b border-border/90 dark:border-foreground/10"
      }`}
    >
      <dt className="text-sm font-medium text-subtle">{label}</dt>
      <dd className={`text-right text-sm tabular-nums ${valueClass}`}>{value}</dd>
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
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-subtle">
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
                    ? "border-border bg-muted/90 dark:bg-white/10"
                    : "border-border bg-muted/40 hover:border-border hover:bg-muted/70"
                }`}
              >
                <div className="font-semibold text-foreground">{s.symbol}</div>
                <div className="text-[11px] text-subtle">Cost {fmtShort(cost)}</div>
                <div className="text-[11px] font-semibold text-subtle">−{fmtShort(loss)}</div>
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
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return fmtCurrency(n);
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
    <div className="space-y-10">
      <div>
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <h3 className="text-sm font-semibold text-primary">Gainers</h3>
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
                  <span className="text-[9px] font-bold tabular-nums text-primary">{fmtShort(gain)}</span>
                  <div className="flex w-9 flex-col justify-end overflow-hidden rounded-md shadow-sm" style={{ height: barH }}>
                    <div className="w-full bg-primary transition-all duration-500" style={{ height: gainH }} />
                    <div className="w-full bg-muted" style={{ height: costH }} />
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
          <h3 className="text-sm font-semibold text-subtle">Losers</h3>
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
                    selectedSymbol === l.symbol ? "ring-2 ring-foreground/25 ring-offset-2 ring-offset-background dark:ring-white/30" : ""
                  }`}
                >
                  <span className="text-[9px] font-bold tabular-nums text-subtle">{fmtShort(loss)}</span>
                  <div className="flex w-9 flex-col justify-end overflow-hidden rounded-md shadow-sm" style={{ height: barH }}>
                    <div className="w-full bg-battleship/70 dark:bg-battleship/55" style={{ height: lossH }} />
                    <div className="w-full bg-muted" style={{ height: curH }} />
                  </div>
                  <span className="text-[8px] font-medium tabular-nums text-subtle">{fmtShort(costBasis)}</span>
                  <span className="text-[8px] font-semibold text-foreground">{l.symbol}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
