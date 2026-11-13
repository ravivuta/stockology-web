"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { appCtaButton } from "@/lib/appCtaClasses";
import { usePortfolioStore } from "@/store/portfolioStore";
import { PortfolioDonut } from "@/components/dashboard/PortfolioDonut";
import { StockDetailExpandPanel } from "@/components/stock/StockDetailExpandPanel";
import { RecommendedActionsWidget } from "@/components/dashboard/RecommendedActionsWidget";
import { DashboardReturnComparison } from "@/components/dashboard/DashboardReturnComparison";
import { setLocalStorageItem, shouldPersistRegenerableCache } from "@/lib/local-storage-quota";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { resolveStocksPmDataUserId } from "@/lib/resolve-stocks-pm-data-user-id";
import { effectiveOutlookCashTargetPct } from "@/lib/market-outlook";
import { shortlistCapacityDiagnostics } from "@/lib/ios-recommendation";
import {
  computeTodayChangeFromHistory,
  computeTodayChangeFromLiveQuotes,
  fetchCloudNetWorthHistory,
  type NetWorthPoint,
} from "@/lib/portfolio-net-worth-series";
import { isUsMarketTradingDay } from "@/lib/market-hours";
import { formatCompactNumber, formatWholeCurrency, formatWholePercent } from "@/lib/numberFormat";
import { cashByAccount, displayAccount, isCashSymbol, preferredAccountLabel } from "@/lib/cash-accounts";
import { fixedIncomeTotal } from "@/lib/fixed-income-accounts";

const CURRENT_VALUE_COLOR = "#14b8a6";

const PALETTE = {
  cash: "var(--dashboard-chart-cash)",
  fixedIncome: "var(--dashboard-chart-fixed-income)",
  costBasis: "var(--dashboard-chart-cost-basis)",
  gain: "var(--dashboard-chart-gain)",
  holdingsValue: CURRENT_VALUE_COLOR,
  loss: "var(--dashboard-chart-loss)",
} as const;

const ETF_PATTERN_PRIMARY =
  "color-mix(in srgb, var(--dashboard-chart-cost-basis) 52%, black)";

function etfPatternPrimaryFor(baseColor: string): string {
  return `color-mix(in srgb, ${baseColor} 52%, black)`;
}

function etfPatternSecondaryFor(baseColor: string): string {
  return `color-mix(in srgb, ${baseColor} 52%, black 74%)`;
}

function etfHatchFor(baseColor: string): string {
  const primary = etfPatternPrimaryFor(baseColor);
  const secondary = etfPatternSecondaryFor(baseColor);
  return (
    `repeating-linear-gradient(45deg, ${primary} 0 0.9px, transparent 0.9px 1.5px), ` +
    `repeating-linear-gradient(135deg, ${secondary} 0 0.6px, transparent 0.6px 3.5px)`
  );
}

type SummaryComparisonSegment = {
  key: string;
  label: string;
  actualPct: number;
  recommendedPct: number;
  color: string;
  usesETFPattern: boolean;
};

function SummaryStackedTrack({
  label,
  items,
  percentKey,
}: {
  label: string;
  items: SummaryComparisonSegment[];
  percentKey: "actualPct" | "recommendedPct";
}) {
  const total = Math.max(
    items.reduce((sum, item) => sum + Math.max(0, item[percentKey]), 0),
    0.0001
  );
  const scale = total > 100 ? 100 / total : 1;

  return (
    <div className="flex items-center gap-1.5">
      <span className="w-[5.75rem] shrink-0 text-[9px] font-semibold leading-tight text-subtle">{label}</span>
      <div className="flex h-3 min-w-0 flex-1 overflow-hidden rounded-[3px] bg-white/20 dark:bg-white/10">
        {items.map((item) => {
          const widthPct = Math.max(0, item[percentKey]) * scale;
          if (widthPct < 0.1) return null;
          return (
            <div
              key={item.key}
              className="relative h-full shrink-0"
              style={{
                width: `${Math.min(widthPct, 100)}%`,
                backgroundColor: item.color,
                backgroundImage: item.usesETFPattern ? etfHatchFor(item.color) : undefined,
              }}
            >
              {item.usesETFPattern ? (
                <span
                  className="absolute inset-y-0 right-0 w-0.5"
                  style={{ backgroundColor: etfPatternPrimaryFor(item.color) }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const reduceMotion = useReducedMotion();
  const stocks = usePortfolioStore((s) => s.stocks);
  const portfolioSize = usePortfolioStore((s) => s.portfolioSize);
  const limitWatchlistSize = usePortfolioStore((s) => s.limitWatchlistSize);
  const enableRiskFilter = usePortfolioStore((s) => s.enableRiskFilter);
  const riskAppetite = usePortfolioStore((s) => s.riskAppetite);
  const marketOutlook = usePortfolioStore((s) => s.marketOutlook);
  const marketOutlookCashTargetRiskOn = usePortfolioStore((s) => s.marketOutlookCashTargetRiskOn);
  const marketOutlookCashTargetNeutral = usePortfolioStore((s) => s.marketOutlookCashTargetNeutral);
  const marketOutlookCashTargetElevated = usePortfolioStore((s) => s.marketOutlookCashTargetElevated);
  const marketOutlookCashTargetRiskOff = usePortfolioStore((s) => s.marketOutlookCashTargetRiskOff);
  const marketOutlookCashTargetSevere = usePortfolioStore((s) => s.marketOutlookCashTargetSevere);
  const useMarketRegimeCashTilt = usePortfolioStore((s) => s.useMarketRegimeCashTilt);
  const cash = usePortfolioStore((s) => s.cashBalance);
  const fixedIncomeByAccount = usePortfolioStore((s) => s.fixedIncomeByAccount);
  const lotsBySymbol = usePortfolioStore((s) => s.lotsBySymbol);
  const [bars, setBars] = useState(true);
  const [dashStockDetail, setDashStockDetail] = useState<string | null>(null);
  const [summaryTab, setSummaryTab] = useState<"summary" | "performance">("summary");
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
  const fixedIncomeValue = useMemo(() => fixedIncomeTotal(fixedIncomeByAccount), [fixedIncomeByAccount]);
  const holdingsPnL = holdingsValue - holdingsCostBasis;
  const etfValue = useMemo(
    () => held.filter((stock) => stock.isETF === true).reduce((sum, stock) => sum + stock.quantity * (stock.lastPrice ?? 0), 0),
    [held]
  );
  const etfCostBasis = useMemo(
    () => held.filter((stock) => stock.isETF === true).reduce((sum, stock) => sum + stock.quantity * stock.averageCost, 0),
    [held]
  );
  const stockValueOnly = Math.max(0, holdingsValue - etfValue);
  const stockCostBasisOnly = Math.max(0, holdingsCostBasis - etfCostBasis);
  const totalBalance = holdingsValue + cash + fixedIncomeValue;
  const totalInvested = holdingsCostBasis + cash + fixedIncomeValue;
  const isProfitable = holdingsPnL >= 0;
  const holdingsPnLPctVsInvested = holdingsCostBasis > 0.0001 ? (holdingsPnL / holdingsCostBasis) * 100 : 0;
  const totalPnLPct = totalInvested > 0.0001 ? (holdingsPnL / totalInvested) * 100 : 0;
  const etfPnL = etfValue - etfCostBasis;
  const stockPnL = holdingsPnL - etfPnL;
  const etfPnLPct = etfCostBasis > 0.0001 ? (etfPnL / etfCostBasis) * 100 : 0;
  const stockPnLPct = stockCostBasisOnly > 0.0001 ? (stockPnL / stockCostBasisOnly) * 100 : 0;
  const todaySnapshotChange = useMemo(
    () => computeTodayChangeFromHistory(cloudHistory ?? [], totalBalance),
    [cloudHistory, totalBalance]
  );
  const todayQuoteChange = useMemo(
    () => computeTodayChangeFromLiveQuotes(stocks.filter((s) => !isCashSymbol(s.symbol)), cash + fixedIncomeValue),
    [stocks, cash, fixedIncomeValue]
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
  const homeShowsAmountValues = usePortfolioStore((s) => s.homeShowsAmountValues);
  const setHomeShowsAmountValues = usePortfolioStore((s) => s.setHomeShowsAmountValues);
  const todayStatusLoading = cloudHistory === null && hasSupabaseConfig();
  const cashSharePct = totalInvested > 0.0001 ? (cash / totalInvested) * 100 : 0;
  const fixedIncomeSharePct = totalInvested > 0.0001 ? (fixedIncomeValue / totalInvested) * 100 : 0;
  const cashEquivalent = cash + fixedIncomeValue;
  const cashEquivalentSharePct = totalInvested > 0.0001 ? (cashEquivalent / totalInvested) * 100 : 0;
  const etfInvestedPct = totalInvested > 0.0001 ? (etfCostBasis / totalInvested) * 100 : 0;
  const stockInvestedPct = totalInvested > 0.0001 ? (stockCostBasisOnly / totalInvested) * 100 : 0;
  const equitiesCostBasis = stockCostBasisOnly + etfCostBasis;
  const equitiesInvestedPct = totalInvested > 0.0001 ? (equitiesCostBasis / totalInvested) * 100 : 0;
  const cashEquivalentTargetPct = marketOutlook
    ? effectiveOutlookCashTargetPct(marketOutlook, {
      riskOn: marketOutlookCashTargetRiskOn,
      neutral: marketOutlookCashTargetNeutral,
      elevated: marketOutlookCashTargetElevated,
      riskOff: marketOutlookCashTargetRiskOff,
      severe: marketOutlookCashTargetSevere,
    })
    : marketOutlookCashTargetNeutral;
  const etfTargetPct = useMemo(() => {
    const diagnostics = shortlistCapacityDiagnostics(
      stocks,
      { limitWatchlistSize, enableRiskFilter, riskAppetite, portfolioSize },
      { etfPenaltyMultiplier: 3 }
    );
    return ((diagnostics.etfMinTargetRatio + diagnostics.etfMaxTargetRatio) / 2) * 100;
  }, [enableRiskFilter, limitWatchlistSize, portfolioSize, riskAppetite, stocks]);
  const stockTargetPct = Math.max(0, 100 - cashEquivalentTargetPct - etfTargetPct);
  const showCashEquivalentBar = useMarketRegimeCashTilt === true;
  const showEtfAndStockBars = limitWatchlistSize === true;
  const totalPnlTextClass =
    holdingsPnL >= 0 ? "text-[color:var(--dashboard-chart-gain)]" : "text-[color:var(--dashboard-chart-loss)]";
  const todayText = showTodayChange
    ? homeShowsAmountValues
      ? `${formatWholeCurrency(Math.abs(todayChange.change))} (${formatWholePercent(todayChange.percent, true)})`
      : formatWholePercent(todayChange.percent, true)
    : "—";
  const costBasisColor = PALETTE.costBasis;
  const summaryComparisonSegments: SummaryComparisonSegment[] = [
    ...(showCashEquivalentBar
      ? [{
          key: "cash-equivalent",
          label: "Cash-equivalent",
          actualPct: cashEquivalentSharePct,
          recommendedPct: cashEquivalentTargetPct,
          color: PALETTE.cash,
          usesETFPattern: false,
        }]
      : []),
    ...(showEtfAndStockBars
      ? [
          ...(etfInvestedPct >= 0.5 || etfTargetPct >= 0.5
            ? [{
                key: "etf",
                label: "ETF",
                actualPct: etfInvestedPct,
                recommendedPct: etfTargetPct,
                color: costBasisColor,
                usesETFPattern: true,
              }]
            : []),
          {
            key: "stocks",
            label: "Stocks",
            actualPct: stockInvestedPct,
            recommendedPct: stockTargetPct,
            color: costBasisColor,
            usesETFPattern: false,
          },
        ]
      : []),
  ];

  const pieData = useMemo(() => {
    if (isProfitable) {
      const tb = Math.max(totalBalance, 0.0001);
      return [
        { name: "Cash", value: cash / tb, color: PALETTE.cash },
        { name: "Fixed Income", value: fixedIncomeValue / tb, color: PALETTE.fixedIncome },
        { name: "Cost", value: holdingsCostBasis / tb, color: PALETTE.costBasis },
        { name: "Gain", value: Math.max(holdingsPnL, 0) / tb, color: PALETTE.gain },
      ];
    }
    const ref = Math.max(cash + fixedIncomeValue + holdingsCostBasis, 0.0001);
    return [
      { name: "Cash", value: cash / ref, color: PALETTE.cash },
      { name: "Fixed Income", value: fixedIncomeValue / ref, color: PALETTE.fixedIncome },
      { name: "Holdings", value: holdingsValue / ref, color: PALETTE.holdingsValue },
      { name: "Loss", value: Math.abs(holdingsPnL) / ref, color: PALETTE.loss },
    ];
  }, [cash, fixedIncomeValue, holdingsValue, holdingsCostBasis, holdingsPnL, isProfitable, totalBalance]);

  const accountBreakdown = useMemo(() => {
    const bySymbol = new Map(stocks.map((stock) => [stock.symbol, stock]));
    const accountMap = new Map<string, { account: string; value: number; costBasis: number; etfValue: number; etfCostBasis: number; cash: number; fixedIncome: number }>();

    const addToAccount = (
      account: string,
      value = 0,
      costBasis = 0,
      cash = 0,
      fixedIncome = 0,
      etfValue = 0,
      etfCostBasis = 0
    ) => {
      if (value <= 0 && costBasis <= 0 && cash <= 0 && fixedIncome <= 0 && etfValue <= 0 && etfCostBasis <= 0) return;
      const key = account.trim().toLowerCase();
      const existing = accountMap.get(key) ?? {
        account,
        value: 0,
        costBasis: 0,
        etfValue: 0,
        etfCostBasis: 0,
        cash: 0,
        fixedIncome: 0,
      };
      existing.value += value;
      existing.costBasis += costBasis;
      existing.etfValue += etfValue;
      existing.etfCostBasis += etfCostBasis;
      existing.cash += cash;
      existing.fixedIncome += fixedIncome;
      existing.account = preferredAccountLabel(existing.account, account);
      accountMap.set(key, existing);
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
        const lotCostTotal = lotQty * lotCost;
        const isEtf = stock.isETF === true;
        addToAccount(account, currentValue, lotCostTotal, 0, 0, isEtf ? currentValue : 0, isEtf ? lotCostTotal : 0);
        remainingQty -= lotQty;
      }

      if (remainingQty > 1e-6) {
        const fallbackValue = remainingQty * price;
        const fallbackCost = remainingQty * averageCost;
        const isEtf = stock.isETF === true;
        addToAccount(
          displayAccount(null),
          fallbackValue,
          fallbackCost,
          0,
          0,
          isEtf ? fallbackValue : 0,
          isEtf ? fallbackCost : 0
        );
      }
    }

    for (const [account, amount] of Object.entries(cashByAccount(lotsBySymbol["$CASH"]))) {
      addToAccount(account, 0, 0, amount);
    }

    for (const [account, amount] of Object.entries(fixedIncomeByAccount)) {
      const normalized = Number(amount);
      if (!Number.isFinite(normalized) || normalized <= 0.005) continue;
      addToAccount(displayAccount(account), 0, 0, 0, normalized);
    }

    const allRows = Array.from(accountMap.values())
      .filter((item) => item.value > 0 || item.costBasis > 0 || item.cash > 0 || item.fixedIncome > 0)
      .sort((a, b) => b.value + b.cash + b.fixedIncome - (a.value + a.cash + a.fixedIncome));

    const total = allRows.reduce((sum, row) => sum + row.value, 0);
    const cashTotal = allRows.reduce((sum, row) => sum + row.cash, 0);
    const fixedIncomeTotal = allRows.reduce((sum, row) => sum + row.fixedIncome, 0);
    if (allRows.length < 1) {
      return null;
    }

    const topRows = allRows.slice(0, 5);
    const remaining = allRows.slice(5);
    const otherValue = remaining.reduce((sum, row) => sum + row.value, 0);
    const otherCost = remaining.reduce((sum, row) => sum + row.costBasis, 0);
    const otherEtfValue = remaining.reduce((sum, row) => sum + row.etfValue, 0);
    const otherEtfCost = remaining.reduce((sum, row) => sum + row.etfCostBasis, 0);
    const otherCash = remaining.reduce((sum, row) => sum + row.cash, 0);
    const otherFixedIncome = remaining.reduce((sum, row) => sum + row.fixedIncome, 0);

    const rows = remaining.length > 0
      ? [...topRows, { account: "Other", value: otherValue, costBasis: otherCost, etfValue: otherEtfValue, etfCostBasis: otherEtfCost, cash: otherCash, fixedIncome: otherFixedIncome }]
      : topRows;

    return { rows, total, cashTotal, fixedIncomeTotal };
  }, [fixedIncomeByAccount, lotsBySymbol, stocks]);

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
            if (shouldPersistRegenerableCache()) setLocalStorageItem("dash_chart_cloudPts", JSON.stringify(rows));
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
          if (shouldPersistRegenerableCache()) setLocalStorageItem("dash_chart_cloudPts", JSON.stringify(rows));
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
        <div className="flex items-center gap-3">
          <div
              className="flex w-full gap-1 rounded-full border border-white/50 bg-white/25 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] backdrop-blur-xl dark:border-white/15 dark:bg-white/[0.07] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
              role="tablist"
              aria-label="Portfolio section"
            >
              {(
                [
                  { id: "summary", label: "Portfolio Summary" },
                  { id: "performance", label: "Performance" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={summaryTab === tab.id}
                  onClick={() => setSummaryTab(tab.id)}
                  className={
                    summaryTab === tab.id
                      ? "flex-1 rounded-full border border-white/70 bg-white/60 px-4 py-2 text-sm font-semibold text-foreground shadow-[0_6px_18px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md dark:border-white/25 dark:bg-white/15 dark:shadow-[0_8px_20px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.22)]"
                      : "flex-1 rounded-full px-4 py-2 text-sm font-semibold text-subtle transition-colors hover:bg-white/25 hover:text-foreground dark:hover:bg-white/10"
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>
          <button
            type="button"
            onClick={() => setHomeShowsAmountValues(!homeShowsAmountValues)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background/80 text-subtle transition-colors hover:text-foreground dark:bg-white/5"
            aria-label={homeShowsAmountValues ? "Hide amounts" : "Show amounts"}
            title={homeShowsAmountValues ? "Hide amounts" : "Show amounts"}
          >
            {homeShowsAmountValues ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        </div>
        {summaryTab === "summary" ? (
        <>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-xl border border-border/45 bg-background/70 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-[11px] font-semibold text-subtle">Total Investments</p>
            <p
              className="mt-1 text-sm font-semibold tabular-nums"
              style={{ color: "var(--dashboard-chart-center-value)" }}
            >
              {homeShowsAmountValues ? formatWholeCurrency(totalInvested) : "••••"}
            </p>
          </div>
          <div className="rounded-xl border border-border/45 bg-background/70 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-[11px] font-semibold text-subtle">Total P/L</p>
            <p className={`mt-1 text-sm font-semibold tabular-nums ${totalPnlTextClass}`}>
              {homeShowsAmountValues
                ? `${formatSummaryNumber(holdingsPnL)} (${formatWholePercent(totalPnLPct, true)})`
                : formatWholePercent(totalPnLPct, true)}
            </p>
          </div>
          <div className="rounded-xl border border-border/45 bg-background/70 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-[11px] font-semibold text-subtle">Today&apos;s change</p>
            <p className={`mt-1 text-sm font-semibold tabular-nums ${showTodayChange ? todayValueClassName : "text-subtle"}`}>
              {todayText}
            </p>
          </div>
          <div className="rounded-xl border border-border/45 bg-background/70 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-[11px] font-semibold text-subtle">Cash</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-[color:var(--dashboard-chart-cash)]">
              {homeShowsAmountValues
                ? `${formatSummaryNumber(cash)} (${Math.round(cashSharePct)}%)`
                : `${Math.round(cashSharePct)}%`}
            </p>
          </div>
          <div className="rounded-xl border border-border/45 bg-background/70 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-[11px] font-semibold text-subtle">Bonds/CDs</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-[color:var(--dashboard-chart-fixed-income)]">
              {homeShowsAmountValues
                ? `${formatSummaryNumber(fixedIncomeValue)} (${Math.round(fixedIncomeSharePct)}%)`
                : `${Math.round(fixedIncomeSharePct)}%`}
            </p>
          </div>
          <div className="rounded-xl border border-border/45 bg-background/70 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-[11px] font-semibold text-subtle">Equities</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-[color:var(--dashboard-chart-cost-basis)]">
              {homeShowsAmountValues
                ? `${formatSummaryNumber(equitiesCostBasis)} (${Math.round(equitiesInvestedPct)}%)`
                : `${Math.round(equitiesInvestedPct)}%`}
            </p>
          </div>
        </div>
        <div className="mt-5 flex items-center gap-3 sm:gap-8">
          <motion.div
            className="flex h-[169px] shrink-0 items-center sm:h-[184px]"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 22, mass: 0.8, delay: reduceMotion ? 0 : 0.08 }}
          >
            <PortfolioDonut
              segments={pieData.map((p) => ({ name: p.name, value: p.value, color: p.color }))}
              etfOverlays={
                isProfitable
                  ? [
                      {
                        segment: "Cost",
                        fraction: Math.min(etfCostBasis, holdingsCostBasis) / Math.max(totalBalance, 0.0001),
                      },
                      {
                        segment: "Gain",
                        fraction:
                          Math.min(
                            Math.max(0, etfValue - etfCostBasis),
                            Math.max(0, holdingsPnL)
                          ) / Math.max(totalBalance, 0.0001),
                      },
                    ]
                  : [
                      {
                        segment: "Holdings",
                        fraction:
                          Math.min(etfValue, holdingsValue) /
                          Math.max(cash + fixedIncomeValue + holdingsCostBasis, 0.0001),
                      },
                      {
                        segment: "Loss",
                        fraction:
                          Math.min(
                            Math.max(0, etfCostBasis - etfValue),
                            Math.max(0, Math.abs(holdingsPnL))
                          ) / Math.max(cash + fixedIncomeValue + holdingsCostBasis, 0.0001),
                      },
                    ]
              }
              totalLabel="Current"
              totalValue={homeShowsAmountValues ? formatWholeCurrency(totalBalance) : "••••"}
              totalLabelClassName="text-subtle"
              totalValueClassName="text-[color:var(--dashboard-chart-center-value)]"
            />
          </motion.div>
          <div className="flex min-h-[169px] min-w-0 flex-1 flex-col justify-center sm:min-h-[184px]">
            <dl className="grid w-full grid-cols-1 gap-1">
            <div className="grid grid-cols-[minmax(4.5rem,1.1fr)_minmax(10ch,1fr)_minmax(10ch,1fr)] items-center gap-x-3 text-[11px] font-semibold text-subtle sm:grid-cols-[minmax(12rem,1.2fr)_minmax(18ch,1fr)_minmax(18ch,1fr)] sm:gap-x-4">
              <span />
              <span className="justify-self-stretch whitespace-nowrap text-left">Current</span>
              <span className="justify-self-stretch whitespace-nowrap text-left">Invested</span>
            </div>
            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-[minmax(4.5rem,1.1fr)_minmax(10ch,1fr)_minmax(10ch,1fr)] items-center gap-x-3 sm:grid-cols-[minmax(12rem,1.2fr)_minmax(18ch,1fr)_minmax(18ch,1fr)] sm:gap-x-4">
                <span className="inline-flex items-center justify-start gap-1 whitespace-nowrap text-left text-xs font-semibold text-subtle sm:text-sm">
                  Stocks
                </span>
                <span className="justify-self-stretch whitespace-nowrap text-left text-xs tabular-nums text-[color:#14b8a6] sm:text-sm">
                  {renderSummaryCurrentWithPnL(
                    homeShowsAmountValues,
                    stockValueOnly,
                    stockPnL,
                    stockPnLPct,
                    "text-[color:#14b8a6]",
                    stockPnL >= 0 ? "text-[color:var(--dashboard-chart-gain)]" : "text-[color:var(--dashboard-chart-loss)]"
                  )}
                </span>
                <span className="justify-self-stretch whitespace-nowrap text-left text-xs tabular-nums text-[color:var(--dashboard-chart-cost-basis)] sm:text-sm">
                  {homeAmountWithPercent(homeShowsAmountValues, stockCostBasisOnly, shareOfPortfolio(stockCostBasisOnly, totalInvested))}
                </span>
              </div>
              <div className="grid grid-cols-[minmax(4.5rem,1.1fr)_minmax(10ch,1fr)_minmax(10ch,1fr)] items-center gap-x-3 text-xs sm:grid-cols-[minmax(12rem,1.2fr)_minmax(18ch,1fr)_minmax(18ch,1fr)] sm:gap-x-4">
                <span className="font-semibold text-subtle">ETF</span>
                <span className="justify-self-stretch whitespace-nowrap text-left font-semibold tabular-nums" style={{ color: ETF_PATTERN_PRIMARY }}>
                  {renderSummaryCurrentWithPnL(
                    homeShowsAmountValues,
                    etfValue,
                    etfPnL,
                    etfPnLPct,
                    "",
                    etfPnL >= 0 ? "text-[color:var(--dashboard-chart-gain)]" : "text-[color:var(--dashboard-chart-loss)]",
                    ETF_PATTERN_PRIMARY
                  )}
                </span>
                <span className="justify-self-stretch whitespace-nowrap text-left font-semibold tabular-nums" style={{ color: etfPatternPrimaryFor("var(--dashboard-chart-cost-basis)") }}>
                  {homeAmountWithPercent(homeShowsAmountValues, etfCostBasis, shareOfPortfolio(etfCostBasis, totalInvested))}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-[minmax(4.5rem,1.1fr)_minmax(10ch,1fr)_minmax(10ch,1fr)] items-center gap-x-3 border-t border-border/15 pt-1 dark:border-white/6 sm:grid-cols-[minmax(12rem,1.2fr)_minmax(18ch,1fr)_minmax(18ch,1fr)] sm:gap-x-4">
                <span className="inline-flex items-center justify-start gap-1 whitespace-nowrap text-left text-xs font-medium text-subtle sm:text-sm">
                  Total Equities
                </span>
                <span className="justify-self-stretch text-left text-xs tabular-nums text-[color:#14b8a6] sm:text-sm">
                  {renderSummaryCurrentWithPnLPercent(
                    homeShowsAmountValues,
                    holdingsValue,
                    holdingsPnLPctVsInvested,
                    "text-[color:#14b8a6]",
                    holdingsPnL >= 0 ? "text-[color:var(--dashboard-chart-gain)]" : "text-[color:var(--dashboard-chart-loss)]"
                  )}
                </span>
                <span className="justify-self-stretch whitespace-nowrap text-left text-xs tabular-nums text-[color:var(--dashboard-chart-cost-basis)] sm:text-sm">
                  {homeAmountWithPercent(homeShowsAmountValues, holdingsCostBasis, shareOfPortfolio(holdingsCostBasis, totalInvested))}
                </span>
            </div>
            </dl>
          </div>
        </div>
        {summaryComparisonSegments.length > 0 ? (
          <div className="-mx-3 mt-4 w-[calc(100%+1.5rem)] rounded-lg bg-white/32 px-1.5 py-2 dark:bg-white/[0.045] sm:-mx-0 sm:w-full">
            <p className="text-xs font-semibold text-foreground">
              Current allocation vs Recommended (per user settings)
            </p>
            <p className="mt-0.5 text-[11px] text-subtle">
              Share of invested amount (cost basis) vs recommended mix
            </p>
            <div className="mt-2 space-y-2">
              <div className="space-y-1.5">
                <SummaryStackedTrack
                  label="Current allocation"
                  items={summaryComparisonSegments}
                  percentKey="actualPct"
                />
                <SummaryStackedTrack
                  label="Recommended"
                  items={summaryComparisonSegments}
                  percentKey="recommendedPct"
                />
              </div>
              <div className="space-y-1">
                {summaryComparisonSegments.map((segment) => (
                  <div key={segment.key} className="flex items-center gap-1.5">
                    <span
                      className="relative h-3 w-3 shrink-0 overflow-hidden rounded-[2px]"
                      style={{
                        backgroundColor: segment.color,
                        backgroundImage: segment.usesETFPattern ? etfHatchFor(segment.color) : undefined,
                      }}
                    />
                    <span className="text-[11px] font-semibold text-foreground">{segment.label}</span>
                    <span className="ml-auto text-[10px] font-semibold tabular-nums text-subtle">
                      {Math.round(Math.max(0, segment.actualPct))}% / {Math.round(Math.max(0, segment.recommendedPct))}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        <p className="mt-4 text-[11px] leading-relaxed text-subtle">
          {showTodayChange
            ? todayQuoteChange.hasBaseline
              ? "Today is calculated from live quote changes against each holding's previous close."
              : "Today falls back to your latest saved portfolio snapshot before today in U.S. Eastern time when live quote deltas are unavailable."
            : todayStatusLoading
              ? "Loading quote deltas and portfolio history for today's change…"
              : "Today's change value is shown on U.S. trading days from 8:00 AM ET once live quote deltas or a prior portfolio snapshot is available."}
        </p>
        </>
        ) : (
          <div className="mt-5">
            <DashboardReturnComparison embedded />
          </div>
        )}
      </motion.section>

      <RecommendedActionsWidget stocks={stocks} />

      {accountBreakdown ? (
        <motion.section
          className="dashboard-panel p-5 text-foreground sm:p-6"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1], delay: reduceMotion ? 0 : 0.1 }}
        >
          <h2 className="text-base font-semibold tracking-tight">Portfolio allocation</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-subtle">
            Holdings and cash grouped by account.
          </p>
          <div className="mt-4 grid gap-3.5 md:grid-cols-[repeat(auto-fit,minmax(22rem,1fr))]" aria-label="Account allocation breakdown">
            {accountBreakdown.rows.map((row, index) => {
              const rowTotal = row.value + row.cash + row.fixedIncome;
              const pct = (rowTotal / Math.max(accountBreakdown.total + accountBreakdown.cashTotal + accountBreakdown.fixedIncomeTotal, 0.0001)) * 100;
              const pnl = row.value - row.costBasis;
              const pnlPct = row.costBasis > 0 ? (pnl / row.costBasis) * 100 : 0;
              const pnlClass = pnl >= 0 ? "text-[color:var(--dashboard-chart-gain)]" : "text-[color:var(--dashboard-chart-loss)]";
              const maxReference = Math.max(
                ...accountBreakdown.rows.map((item) => Math.max(item.value, item.costBasis) + Math.max(0, item.cash) + Math.max(0, item.fixedIncome)),
                0.0001
              );
              const valueWidthPct = Math.max(0, (row.value / maxReference) * 100);
              const costWidthPct = Math.max(0, (Math.min(row.costBasis, row.value) / maxReference) * 100);
              const profitWidthPct = pnl > 0 ? (pnl / maxReference) * 100 : 0;
              const lossWidthPct = pnl < 0 ? (Math.abs(pnl) / maxReference) * 100 : 0;
              const cashWidthPct = Math.max(0, (row.cash / maxReference) * 100);
              const fixedIncomeWidthPct = Math.max(0, (row.fixedIncome / maxReference) * 100);
              const holdingsSpanPct = Math.max(valueWidthPct, costWidthPct + profitWidthPct, valueWidthPct + lossWidthPct);
              const etfPnl = row.etfValue - row.etfCostBasis;
              const etfValuePct = Math.max(0, (row.etfValue / maxReference) * 100);
              const etfProfitPct = pnl > 0 ? Math.max(0, (Math.max(0, etfPnl) / maxReference) * 100) : 0;
              const etfLossPct = pnl < 0 ? Math.max(0, (Math.max(0, -etfPnl) / maxReference) * 100) : 0;
              const fixedIncomeOriginPct = holdingsSpanPct;
              const cashOriginPct = fixedIncomeOriginPct + fixedIncomeWidthPct;
              const etfValueBoundaryColor = etfPatternPrimaryFor("var(--dashboard-chart-cost-basis)");
              const etfProfitBoundaryColor = etfPatternPrimaryFor("var(--dashboard-chart-gain)");
              const etfLossBoundaryColor = etfPatternPrimaryFor("var(--dashboard-chart-loss)");

              return (
                <div key={`${row.account}-${index}`} className="text-sm">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="min-w-0 truncate font-medium text-foreground">
                      {row.account}
                    </span>
                    <span className="shrink-0 tabular-nums font-medium text-foreground">
                      {homeShowsAmountValues ? `${formatWholeCurrency(rowTotal)} (${Math.round(pct)}%)` : `${Math.round(pct)}%`}
                    </span>
                  </div>

                  <div className="relative mt-1 h-3 w-full">
                    <div
                      className="absolute inset-y-0 left-0"
                      style={{ width: `${valueWidthPct}%`, backgroundColor: "var(--dashboard-chart-cost-basis)" }}
                    />
                    {etfValuePct > 0 ? (
                      <div
                        className="absolute inset-y-0 left-0"
                        style={{ width: `${etfValuePct}%`, backgroundImage: etfHatchFor("var(--dashboard-chart-cost-basis)") }}
                      />
                    ) : null}
                    {etfValuePct > 0 && etfValuePct < 100 ? (
                      <div
                        className="absolute inset-y-0 w-px"
                        style={{ left: `calc(${etfValuePct}% - 0.5px)`, backgroundColor: etfValueBoundaryColor }}
                      />
                    ) : null}
                    {profitWidthPct > 0 ? (
                      <div
                        className="absolute inset-y-0"
                        style={{
                          left: `${costWidthPct}%`,
                          width: `${profitWidthPct}%`,
                          backgroundColor: "var(--dashboard-chart-gain)",
                        }}
                      />
                    ) : null}
                    {etfProfitPct > 0 ? (
                      <div
                        className="absolute inset-y-0"
                        style={{
                          left: `${costWidthPct}%`,
                          width: `${etfProfitPct}%`,
                          backgroundImage: etfHatchFor("var(--dashboard-chart-gain)"),
                        }}
                      />
                    ) : null}
                    {etfProfitPct > 0 ? (
                      <div
                        className="absolute inset-y-0 w-px"
                        style={{ left: `calc(${costWidthPct + etfProfitPct}% - 0.5px)`, backgroundColor: etfProfitBoundaryColor }}
                      />
                    ) : null}
                    {lossWidthPct > 0 ? (
                      <div
                        className="absolute inset-y-0"
                        style={{
                          left: `${valueWidthPct}%`,
                          width: `${lossWidthPct}%`,
                          backgroundColor: "var(--dashboard-chart-loss)",
                        }}
                      />
                    ) : null}
                    {etfLossPct > 0 ? (
                      <div
                        className="absolute inset-y-0"
                        style={{
                          left: `${valueWidthPct}%`,
                          width: `${etfLossPct}%`,
                          backgroundImage: etfHatchFor("var(--dashboard-chart-loss)"),
                        }}
                      />
                    ) : null}
                    {etfLossPct > 0 ? (
                      <div
                        className="absolute inset-y-0 w-px"
                        style={{ left: `calc(${valueWidthPct + etfLossPct}% - 0.5px)`, backgroundColor: etfLossBoundaryColor }}
                      />
                    ) : null}
                    {fixedIncomeWidthPct > 0 ? (
                      <div
                        className="absolute inset-y-0"
                        style={{
                          left: `${fixedIncomeOriginPct}%`,
                          width: `${fixedIncomeWidthPct}%`,
                          backgroundColor: "var(--dashboard-chart-fixed-income)",
                        }}
                      />
                    ) : null}
                    {cashWidthPct > 0 ? (
                      <div
                        className="absolute inset-y-0"
                        style={{
                          left: `${cashOriginPct}%`,
                          width: `${cashWidthPct}%`,
                          backgroundColor: "var(--dashboard-chart-cash)",
                        }}
                      />
                    ) : null}
                    {[
                      profitWidthPct > 0 ? costWidthPct : null,
                      lossWidthPct > 0 ? valueWidthPct : null,
                      fixedIncomeWidthPct > 0 ? fixedIncomeOriginPct : null,
                      cashWidthPct > 0 ? cashOriginPct : null,
                    ]
                      .filter((mark): mark is number => mark != null && mark > 0 && mark < 100)
                      .map((mark, separatorIndex) => (
                        <div
                          key={`separator-${separatorIndex}-${mark.toFixed(2)}`}
                          className="absolute inset-y-0 w-px bg-white/95 dark:bg-black/80"
                          style={{ left: `calc(${mark}% - 0.5px)` }}
                        />
                      ))}
                  </div>

                  <p className="mt-1.5 text-[11px] font-bold leading-snug tabular-nums">
                    <span className="text-[color:var(--dashboard-chart-cost-basis)]">
                      {homeShowsAmountValues
                        ? `Cost ${formatWholeCurrency(row.costBasis)} (${shareOfRow(row.costBasis, rowTotal)})`
                        : `Cost ${shareOfRow(row.costBasis, rowTotal)}`}
                    </span>
                    <span className="text-subtle"> · </span>
                    <span className={pnlClass}>
                      {homeShowsAmountValues
                        ? `P/L ${formatWholeCurrency(pnl)} (${`${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%`})`
                        : `P/L ${`${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%`}`}
                    </span>
                    {row.fixedIncome > 0 ? (
                      <>
                        <span className="text-subtle"> · </span>
                        <span className="text-[color:var(--dashboard-chart-fixed-income)]">
                          {homeShowsAmountValues
                            ? `Fixed Income ${formatWholeCurrency(row.fixedIncome)} (${shareOfRow(row.fixedIncome, rowTotal)})`
                            : `Fixed Income ${shareOfRow(row.fixedIncome, rowTotal)}`}
                        </span>
                      </>
                    ) : null}
                    <span className="text-subtle"> · </span>
                    <span className="text-[color:var(--dashboard-chart-cash)]">
                      {homeShowsAmountValues
                        ? `Cash ${formatWholeCurrency(row.cash)} (${shareOfRow(row.cash, rowTotal)})`
                        : `Cash ${shareOfRow(row.cash, rowTotal)}`}
                    </span>
                  </p>

                </div>
              );
            })}
          </div>
        </motion.section>
      ) : null}

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
              className="grid min-w-0 gap-8 sm:grid-cols-2"
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

function shareOfRow(part: number, total: number): string {
  const pct = total > 0.0001 ? (part / total) * 100 : 0;
  return `${Math.round(pct)}%`;
}

function shareOfPortfolio(part: number, total: number): string {
  return `${shareOfRow(part, total)} of portfolio`;
}

function homeAmountWithPercent(showAmounts: boolean, value: number, percent: string): string {
  return showAmounts ? `${formatSummaryNumber(value)} (${percent})` : percent;
}

function formatSummaryPercentForCurrent(value: number): string {
  const absValue = Math.abs(value);
  return absValue > 1 ? `${absValue.toFixed(0)}%` : `${absValue.toFixed(1)}%`;
}

function renderSummaryCurrentWithPnL(
  showAmounts: boolean,
  currentValue: number,
  pnlValue: number,
  pnlPercent: number,
  baseClassName: string,
  pnlClassName: string,
  baseColor?: string
): ReactNode {
  const pnlPercentText = formatSummaryPercentForCurrent(pnlPercent);
  if (!showAmounts) {
    return <span className={pnlClassName}>{pnlPercentText}</span>;
  }
  const baseStyle = baseColor ? { color: baseColor } : undefined;
  return (
    <>
      <span className={baseClassName} style={baseStyle}>{formatSummaryNumber(currentValue)} (</span>
      <span className={pnlClassName}>{formatSummaryNumber(Math.abs(pnlValue))}, {pnlPercentText}</span>
      <span className={baseClassName} style={baseStyle}>)</span>
    </>
  );
}

function renderSummaryCurrentWithPnLPercent(
  showAmounts: boolean,
  currentValue: number,
  pnlPercent: number,
  baseClassName: string,
  pnlClassName: string
): ReactNode {
  const pnlPercentText = formatSummaryPercentForCurrent(pnlPercent);
  if (!showAmounts) {
    return <span className={pnlClassName}>{pnlPercentText}</span>;
  }
  return (
    <>
      <span className={baseClassName}>{formatSummaryNumber(currentValue)} (</span>
      <span className={pnlClassName}>{pnlPercentText}</span>
      <span className={baseClassName}>)</span>
    </>
  );
}

function formatSummaryNumber(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absValue >= 1_000_000_000) {
    return `${sign}${(absValue / 1_000_000_000).toFixed(3)}B`;
  }
  if (absValue >= 1_000_000) {
    return `${sign}${(absValue / 1_000_000).toFixed(3)}M`;
  }
  if (absValue >= 1_000) {
    return `${sign}${Math.round(absValue / 1_000)}k`;
  }
  return `${sign}${Math.round(absValue)}`;
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

  const tiles = useMemo(() => layoutHeatmapTiles(items, HEATMAP_SIDE_PX, 0), [items]);

  if (items.length === 0) {
    return <p className="text-xs text-subtle">No holdings to map.</p>;
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="relative aspect-square w-full overflow-hidden rounded-[10px]">
        {tiles.map((tile) => {
          const intensity = Math.min(1, Math.abs(tile.pnlPercent) / 25);
          const colorVar = tile.pnl >= 0 ? "var(--dashboard-chart-gain)" : "var(--dashboard-chart-loss)";
          const mix = 45 + 55 * intensity;
          const showPercent = tile.height >= 36 && tile.width >= 44;
          const showAmount = tile.height >= 54 && tile.width >= 56;
          const selected = selectedSymbol === tile.symbol;
          // Overlap by 1 layout px so percentage rounding cannot open a seam.
          const bleed = 1;
          return (
            <button
              key={tile.symbol}
              type="button"
              onClick={() => onToggleSymbol(tile.symbol)}
              className={`no-ui-hover m-0 overflow-hidden border-0 p-1.5 text-left text-white ${
                selected ? "z-10 ring-2 ring-white ring-inset" : ""
              }`}
              style={{
                position: "absolute",
                left: `${((tile.x - bleed) / HEATMAP_SIDE_PX) * 100}%`,
                top: `${((tile.y - bleed) / HEATMAP_SIDE_PX) * 100}%`,
                width: `${((tile.width + bleed * 2) / HEATMAP_SIDE_PX) * 100}%`,
                height: `${((tile.height + bleed * 2) / HEATMAP_SIDE_PX) * 100}%`,
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

const holdingsBarScrollerClass =
  "holdings-bar-scroller flex h-44 w-full min-w-0 flex-nowrap items-end gap-2 overflow-x-auto overscroll-x-contain pb-2";
const holdingsBarButtonClass = "ui-hover-pop flex w-14 shrink-0 flex-col items-center gap-1 rounded-md";
const holdingsBarTrackClass = "flex w-11 shrink-0 flex-col justify-end overflow-hidden rounded-md shadow-sm";

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
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <h3 className="text-sm font-semibold text-[color:var(--dashboard-chart-gain)]">Gainers</h3>
          <span className="text-xs text-subtle">Cost basis {fmtShort(totalGainerCb)}</span>
        </div>
        {sortedG.length === 0 ? (
          <EmptyCol message="No gainers to chart." sub="Switch to cards or add positions." />
        ) : (
          <div className={holdingsBarScrollerClass}>
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
                  className={`${holdingsBarButtonClass} ${
                    selectedSymbol === g.symbol ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
                  }`}
                >
                  <span className="max-w-full truncate text-[9px] font-bold tabular-nums text-[color:var(--dashboard-chart-gain)]">{fmtShort(gain)}</span>
                  <div className={holdingsBarTrackClass} style={{ height: barH }}>
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
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <h3 className="text-sm font-semibold text-[color:var(--dashboard-chart-loss)]">Losers</h3>
          <span className="text-xs text-subtle">Cost basis {fmtShort(totalLoserCb)}</span>
        </div>
        {sortedL.length === 0 ? (
          <EmptyCol message="No losers to chart." sub="Switch to cards or add positions." />
        ) : (
          <div className={holdingsBarScrollerClass}>
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
                  className={`${holdingsBarButtonClass} ${
                    selectedSymbol === l.symbol
                      ? "ring-2 ring-[color:var(--dashboard-chart-loss)] ring-offset-2 ring-offset-background"
                      : ""
                  }`}
                >
                  <span className="max-w-full truncate text-[9px] font-bold tabular-nums text-[color:var(--dashboard-chart-loss)]">{fmtShort(loss)}</span>
                  <div className={holdingsBarTrackClass} style={{ height: barH }}>
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
