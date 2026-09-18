"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { useReducedMotion } from "framer-motion";
import { usePortfolioStore } from "@/store/portfolioStore";
import { useDashboardChartTheme } from "@/hooks/useDashboardChartTheme";
import { hasSupabaseConfig, createClient } from "@/lib/supabase/client";
import { resolveStocksPmDataUserId } from "@/lib/resolve-stocks-pm-data-user-id";
import { fetchTickerHydrationFromTables } from "@/lib/ticker-direct-hydration";
import {
  computeLivePortfolioTotal,
  fetchCloudNetWorthHistory,
  finalizeNetWorthSeries,
  hasEnoughHistoryForSpyComparison,
  mergeNetWorthOverlay,
  reconstructNetWorthFromHoldingsCloses,
  type NetWorthPoint,
} from "@/lib/portfolio-net-worth-series";
import {
  CHART_RANGE_LABEL,
  HOME_COMPARE_DURATION_ORDER,
  type ChartRangePreset,
  filterDataByRange,
} from "@/lib/chart-range-presets";
import { paddedValueDomain } from "@/lib/chart-y-domain";
import { evenlySpacedTimeTickValues, evenlySpacedValueTicks } from "@/lib/chart-axis-ticks";
import { APP_CTA_FILL } from "@/lib/appCtaClasses";
import { formatCompactCurrency, formatCurrency, formatPercent, formatWholeCurrency } from "@/lib/numberFormat";
import { cn } from "@/lib/utils";
import {
  adjustNetWorthPointsForExternalCashFlows,
  appendOrReplaceLiveSpyComparisonRow,
  mergePortfolioWithSpyDaily,
  toCumulativePercentRows,
  type ComparisonChartRow,
  type ExternalCashFlowPoint,
  type SpyLiveQuote,
  type SpyDaily,
} from "@/lib/dashboard-return-series";
import { isUsMarketExtendedHoursOpen } from "@/lib/market-hours";
import { fetchHistoricalPricePoints } from "@/lib/supabase-stock-history";

const PALETTE = {
  portfolioLine: "var(--dashboard-chart-portfolio-line)",
  spyLine: "var(--dashboard-chart-benchmark-line)",
  sma50: "var(--dashboard-chart-cash)",
  sma200: "var(--dashboard-chart-cost-basis)",
} as const;

const SPY_DURATION_ORDER: ChartRangePreset[] = ["3m", "1y"];
const HOME_CHART_MODES = [
  { id: "vsSpy", label: "vs S&P" },
  { id: "portfolio", label: "Portfolio" },
  { id: "spy", label: "SPY" },
] as const;
type HomeChartMode = (typeof HOME_CHART_MODES)[number]["id"];

function rollingSma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null);
  if (period <= 0 || values.length === 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i + 1 >= period) out[i] = sum / period;
  }
  return out;
}

function formatChartAxisDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatChartTooltipHeading(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function spyDateToMs(date: string): number {
  const t = Date.parse(`${date}T12:00:00Z`);
  return Number.isFinite(t) ? t : 0;
}

function toSpyPriceRows(
  spySeries: SpyDaily[],
  range: ChartRangePreset,
  liveQuote: SpyLiveQuote | null
): { rows: ComparisonChartRow[]; usedFullHistoryFallback: boolean } {
  const withT = spySeries
    .map((s) => ({ t: spyDateToMs(s.date), value: s.close }))
    .filter((p) => p.t > 0 && Number.isFinite(p.value) && p.value > 0)
    .sort((a, b) => a.t - b.t);
  if (withT.length === 0) {
    return { rows: [], usedFullHistoryFallback: false };
  }

  if (liveQuote && Number.isFinite(liveQuote.lastPrice) && liveQuote.lastPrice > 0) {
    const nowMs = Date.now();
    const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(nowMs));
    const last = withT.at(-1);
    const lastYmd = last
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(last.t))
      : null;
    if (last && lastYmd === todayYmd) {
      last.value = liveQuote.lastPrice;
    } else {
      withT.push({ t: nowMs, value: liveQuote.lastPrice });
    }
  }

  const closes = withT.map((p) => p.value);
  const sma50 = rollingSma(closes, 50);
  const sma200 = rollingSma(closes, 200);
  const enriched = withT.map((p, i) => ({
    t: p.t,
    value: p.value,
    sma50: sma50[i],
    sma200: sma200[i],
  }));

  const { filtered, usedFullHistoryFallback } = filterDataByRange(enriched, range);
  const pts = filtered.length >= 1 ? filtered : enriched;
  const rows: ComparisonChartRow[] = pts.map((p) => ({
    dateMs: p.t,
    value: p.value,
    portfolioPct: 0,
    spyPct: 0,
    sma50: p.sma50,
    sma200: p.sma200,
  }));

  return { rows, usedFullHistoryFallback };
}

const EMPTY_NET_WORTH: NetWorthPoint[] = [];

function portfolioOnlyPercentRows(points: NetWorthPoint[]): ComparisonChartRow[] {
  if (points.length === 0) return [];
  const v0 = points[0].value;
  return points.map((p) => ({
    dateMs: p.t,
    value: p.value,
    portfolioPct: v0 > 0 && Number.isFinite(v0) ? 100 * (p.value / v0 - 1) : 0,
    spyPct: 0,
  }));
}

// ── localStorage cache helpers ───────────────────────────────────────────────
const LS_CLOUD_PTS = "dash_chart_cloudPts";
const LS_SPY_SERIES = "dash_chart_spySeries";
const LS_EXT_FLOWS = "dash_chart_extFlows";

function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota exceeded – silent */ }
}
// ─────────────────────────────────────────────────────────────────────────────

export function DashboardReturnComparison() {
  const reduceMotion = useReducedMotion();
  const chart = useDashboardChartTheme();
  const stocks = usePortfolioStore((s) => s.stocks);
  const cash = usePortfolioStore((s) => s.cashBalance);
  const tradeJournal = usePortfolioStore((s) => s.tradeJournal ?? []);

  const [chartMode, setChartMode] = useState<HomeChartMode>("vsSpy");
  const [range, setRange] = useState<ChartRangePreset>("3m");
  // Pre-seed from cache so the chart renders immediately on mount
  const [cloudPts, setCloudPts] = useState<NetWorthPoint[] | null>(
    () => lsGet<NetWorthPoint[]>(LS_CLOUD_PTS)
  );
  const [externalCashFlows, setExternalCashFlows] = useState<ExternalCashFlowPoint[] | null>(
    () => lsGet<ExternalCashFlowPoint[]>(LS_EXT_FLOWS)
  );
  const [spySeries, setSpySeries] = useState<SpyDaily[] | null>(
    () => lsGet<SpyDaily[]>(LS_SPY_SERIES)
  );
  const [spyLiveQuote, setSpyLiveQuote] = useState<SpyLiveQuote | null>(null);

  const liveTotal = useMemo(() => computeLivePortfolioTotal(stocks, cash), [stocks, cash]);
  const heldPositions = useMemo(
    () => stocks.filter((s) => s.quantity > 0).map((s) => ({ symbol: s.symbol, quantity: s.quantity })),
    [stocks]
  );
  const holdingsKey = useMemo(
    () => heldPositions.map((h) => `${h.symbol}:${h.quantity}`).sort().join("|") + `|cash:${cash}`,
    [heldPositions, cash]
  );
  const pricesReady = useMemo(() => {
    const pos = stocks.filter((s) => s.quantity > 0);
    return pos.length === 0 || pos.some((s) => (s.lastPrice ?? 0) > 0);
  }, [stocks]);

  useEffect(() => {
    let cancelled = false;
    // Don't null-reset — cached state stays visible while fresh data loads
    async function run() {
      if (!hasSupabaseConfig()) {
        if (!cancelled) {
          setCloudPts((prev) => prev ?? []);
          setExternalCashFlows((prev) => prev ?? []);
        }
        return;
      }
      try {
        const supabase = createClient();
        const cachedDataUserId =
          typeof sessionStorage !== "undefined"
            ? sessionStorage.getItem("stocks-pm-active-data-user-id")
            : null;
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid && !cachedDataUserId) {
          return;
        }
        const dataUserId = cachedDataUserId ?? (uid ? await resolveStocksPmDataUserId(supabase, uid) : null);
        if (!dataUserId) return;

        const snapshotPts = await fetchCloudNetWorthHistory(supabase, dataUserId);
        const reconstructedPts =
          heldPositions.length > 0
            ? reconstructNetWorthFromHoldingsCloses(
                heldPositions,
                cash,
                Object.fromEntries(
                  await Promise.all(
                    heldPositions.map(async (holding) => {
                      const { points } = await fetchHistoricalPricePoints(supabase, holding.symbol, 400);
                      return [holding.symbol, points] as const;
                    })
                  )
                )
              )
            : [];
        const rows = mergeNetWorthOverlay(reconstructedPts, snapshotPts);

        const { data: flowData, error: flowError } = await supabase.rpc("get_external_cash_flows", {
          p_user_id: dataUserId,
          p_limit: 2000,
        });

        const flows = !flowError && Array.isArray(flowData)
          ? flowData
              .map((row) => {
                const amount = Number((row as { amount?: unknown }).amount);
                const occurredAt = new Date(String((row as { occurred_at?: unknown }).occurred_at ?? "")).getTime();
                if (!Number.isFinite(amount) || !Number.isFinite(occurredAt)) return null;
                return { amount, occurredAtMs: occurredAt };
              })
              .filter((row): row is ExternalCashFlowPoint => row !== null)
          : [];

        if (!cancelled) {
          setCloudPts(rows);
          setExternalCashFlows(flows);
          lsSet(LS_CLOUD_PTS, rows);
          lsSet(LS_EXT_FLOWS, flows);
        }
      } catch {
        // Keep cached data on error — don't blank the chart
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [cash, heldPositions, holdingsKey]);

  useEffect(() => {
    let cancelled = false;
    // Don't null-reset — cached state stays visible while fresh data loads
    (async () => {
      if (!hasSupabaseConfig()) {
        if (!cancelled) setSpySeries([]);
        return;
      }
      try {
        const supabase = createClient();
        const { points, error } = await fetchHistoricalPricePoints(supabase, "SPY", 1400);
        if (cancelled) return;
        if (error || points.length === 0) {
          // Only blank it out when there's no cached data to show
          setSpySeries((prev) => prev ?? []);
          return;
        }
        const series: SpyDaily[] = points.map((p) => ({ date: p.date, close: p.close }));
        setSpySeries(series);
        lsSet(LS_SPY_SERIES, series);
      } catch {
        // Keep cached data on error
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;
    setSpyLiveQuote(null);

    async function run() {
      if (!hasSupabaseConfig()) {
        if (!cancelled) setSpyLiveQuote(null);
        return;
      }
      try {
        const supabase = createClient();
        const { prices } = await fetchTickerHydrationFromTables(supabase, ["SPY"]);
        if (cancelled) return;
        const lastPrice = Number(prices.SPY?.last_price);
        setSpyLiveQuote(Number.isFinite(lastPrice) && lastPrice > 0 ? { lastPrice } : null);
      } catch {
        if (!cancelled) setSpyLiveQuote(null);
      }
    }

    void run();
    if (typeof window !== "undefined") {
      intervalId = window.setInterval(() => {
        void run();
      }, 60 * 60 * 1000);
    }

    return () => {
      cancelled = true;
      if (intervalId != null) window.clearInterval(intervalId);
    };
  }, []);

  const meta = useMemo(() => {
    if (cloudPts === null) return null;
    return finalizeNetWorthSeries(cloudPts, tradeJournal, liveTotal, pricesReady);
  }, [cloudPts, tradeJournal, liveTotal, pricesReady]);

  const fullPortfolioPts = useMemo(() => meta?.points ?? EMPTY_NET_WORTH, [meta]);
  const flowAdjustedPortfolioPts = useMemo(
    () => (externalCashFlows ? adjustNetWorthPointsForExternalCashFlows(fullPortfolioPts, externalCashFlows) : EMPTY_NET_WORTH),
    [fullPortfolioPts, externalCashFlows]
  );

  const spyLoadedOk = !!(spySeries && spySeries.length > 0);
  const historyReady = cloudPts !== null && meta !== null;
  const hasEnoughHistory = hasEnoughHistoryForSpyComparison(meta?.source, cloudPts, fullPortfolioPts);
  const forcedSpyOnly = historyReady && !hasEnoughHistory;
  const showSpyOnlyChart = forcedSpyOnly || (historyReady && chartMode === "spy");
  const vsSpy = chartMode === "vsSpy";

  const spyDuration: ChartRangePreset = range === "3m" ? "3m" : "1y";

  const spyOnlyData = useMemo(() => {
    if (!spySeries || spySeries.length === 0) {
      return { rows: [] as ComparisonChartRow[], usedFullHistoryFallback: false };
    }
    return toSpyPriceRows(spySeries, spyDuration, spyLiveQuote);
  }, [spySeries, spyDuration, spyLiveQuote]);

  const { comparisonRows, usedFullHistoryFallback, spyAligned } = useMemo(() => {
    if (flowAdjustedPortfolioPts.length === 0) {
      return { comparisonRows: [] as ComparisonChartRow[], usedFullHistoryFallback: false, spyAligned: false };
    }

    if (spyLoadedOk) {
      const withT = flowAdjustedPortfolioPts.map((p) => ({ ...p, t: p.t }));
      const { filtered, usedFullHistoryFallback: fb } = filterDataByRange(withT, range);
      const pts = filtered.length >= 1 ? filtered : flowAdjustedPortfolioPts;
      const tMin = pts[0].t;
      const tMax = pts[pts.length - 1].t;
      let narrowed = mergePortfolioWithSpyDaily(flowAdjustedPortfolioPts, spySeries!, tMin, tMax);
      if (isUsMarketExtendedHoursOpen()) {
        narrowed = appendOrReplaceLiveSpyComparisonRow(narrowed, pts, spyLiveQuote);
      }
      let extraFb = false;
      if (narrowed.length === 0 && flowAdjustedPortfolioPts.length > 0) {
        const fp = flowAdjustedPortfolioPts;
        narrowed = mergePortfolioWithSpyDaily(flowAdjustedPortfolioPts, spySeries!, fp[0].t, fp[fp.length - 1].t);
        if (isUsMarketExtendedHoursOpen()) {
          narrowed = appendOrReplaceLiveSpyComparisonRow(narrowed, fp, spyLiveQuote);
        }
        extraFb = true;
      }
      return {
        comparisonRows: toCumulativePercentRows(narrowed),
        usedFullHistoryFallback: fb || extraFb,
        spyAligned: narrowed.length > 0,
      };
    }

    const withT = flowAdjustedPortfolioPts.map((p) => ({ ...p, t: p.t }));
    const { filtered, usedFullHistoryFallback: fb } = filterDataByRange(withT, range);
    const pts = filtered.length >= 1 ? filtered : flowAdjustedPortfolioPts;
    return {
      comparisonRows: portfolioOnlyPercentRows(pts),
      usedFullHistoryFallback: fb,
      spyAligned: false,
    };
  }, [flowAdjustedPortfolioPts, spySeries, range, spyLoadedOk, spyLiveQuote]);

  const valueModeData = useMemo(() => {
    const ptT = fullPortfolioPts.map((p) => ({ ...p, t: p.t }));
    const { filtered, usedFullHistoryFallback: fb } = filterDataByRange(ptT, range);
    const pts = filtered.length >= 1 ? filtered : fullPortfolioPts;
    return {
      rows: pts.map((p) => ({
        dateMs: p.t,
        value: p.value,
        portfolioPct: 0,
        spyPct: 0,
      })),
      usedFullHistoryFallback: fb,
    };
  }, [fullPortfolioPts, range]);

  const pctYDomain = useMemo(() => {
    const vals: number[] = [];
    for (const r of comparisonRows) {
      vals.push(r.portfolioPct, r.spyPct);
    }
    return paddedValueDomain(vals, 0.12);
  }, [comparisonRows]);

  const valueYDomain = useMemo(() => {
    return paddedValueDomain(
      valueModeData.rows.map((r) => r.value),
      0.1
    );
  }, [valueModeData.rows]);

  const spyOnlyYDomain = useMemo(() => {
    const vals: number[] = [];
    for (const r of spyOnlyData.rows) {
      vals.push(r.value);
      if (r.sma50 != null && Number.isFinite(r.sma50)) vals.push(r.sma50);
      if (r.sma200 != null && Number.isFinite(r.sma200)) vals.push(r.sma200);
    }
    return paddedValueDomain(vals, 0.1);
  }, [spyOnlyData.rows]);

  const loading =
    !historyReady ||
    spySeries === null ||
    (hasEnoughHistory && externalCashFlows === null);
  const chartAnimate = !reduceMotion && chart.ready;
  const lineData = showSpyOnlyChart ? spyOnlyData.rows : vsSpy ? comparisonRows : valueModeData.rows;
  const showSpyLine = !showSpyOnlyChart && vsSpy && spyLoadedOk && spyAligned && comparisonRows.length > 0;
  const chartKey = `${showSpyOnlyChart ? `spy-${spyDuration}` : vsSpy ? `cmp-${range}` : `val-${range}`}-${lineData.length}`;

  const xTickMs = useMemo(() => {
    if (lineData.length === 0) return [];
    const sorted = [...lineData].sort((a, b) => a.dateMs - b.dateMs);
    return evenlySpacedTimeTickValues(sorted[0]!.dateMs, sorted[sorted.length - 1]!.dateMs, 5);
  }, [lineData]);

  const pctYTicks = useMemo(() => evenlySpacedValueTicks(pctYDomain[0], pctYDomain[1], 5), [pctYDomain]);
  const valueYTicks = useMemo(() => evenlySpacedValueTicks(valueYDomain[0], valueYDomain[1], 5), [valueYDomain]);
  const spyOnlyYTicks = useMemo(
    () => evenlySpacedValueTicks(spyOnlyYDomain[0], spyOnlyYDomain[1], 5),
    [spyOnlyYDomain]
  );

  return (
    <section className="dashboard-panel p-5 text-foreground sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Portfolio Performance</h2>
          <p className="mt-0.5 text-xs text-subtle">
            {showSpyOnlyChart
              ? "SPY price with 50 / 200 day moving averages"
              : vsSpy
                ? "Cumulative % vs S&P 500 (SPY), adjusted for external cash flows"
                : "Portfolio value over time"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex flex-wrap gap-1 rounded-lg border border-border bg-background/80 p-1 shadow-sm dark:bg-white/5"
            role="group"
            aria-label="Chart time range"
          >
            {(showSpyOnlyChart ? SPY_DURATION_ORDER : HOME_COMPARE_DURATION_ORDER).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRange(key)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  (showSpyOnlyChart ? spyDuration : range) === key
                    ? cn(APP_CTA_FILL, "shadow-sm")
                    : "text-subtle hover:bg-muted/80 hover:text-foreground dark:hover:bg-white/10"
                )}
              >
                {CHART_RANGE_LABEL[key]}
              </button>
            ))}
          </div>
          {hasEnoughHistory ? (
            <button
              type="button"
              onClick={() => {
                const order: HomeChartMode[] = ["vsSpy", "portfolio", "spy"];
                const next = order[(order.indexOf(chartMode) + 1) % order.length]!;
                if (next === "spy" && range === "max") setRange("1y");
                setChartMode(next);
              }}
              className="rounded-lg border border-border bg-background/90 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 dark:border-white/10 dark:bg-white/5 dark:hover:border-primary/35"
              aria-label={`Chart mode ${HOME_CHART_MODES.find((mode) => mode.id === chartMode)?.label ?? chartMode}. Tap to cycle vs S&P, Portfolio, and SPY.`}
            >
              {HOME_CHART_MODES.find((mode) => mode.id === chartMode)?.label ?? "vs S&P"}
            </button>
          ) : (
            <span className="rounded-lg border border-border bg-background/90 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm dark:border-white/10 dark:bg-white/5">
              SPY
            </span>
          )}
        </div>
      </div>
      <div className={`${chart.plotShellClass} h-[220px] sm:h-[248px]`}>
        <div className={chart.gridLineClass} />
        <div
          className="absolute left-3 top-3 z-10 flex flex-wrap gap-3 rounded-lg px-2 py-1.5 text-[10px] font-medium shadow-sm backdrop-blur-md"
          style={{ backgroundColor: chart.legendBg, color: chart.legendText }}
        >
          {showSpyOnlyChart ? (
            <>
              <span className="flex items-center gap-1.5">
                <span
                  className="h-0.5 w-4 rounded-full"
                  style={{ backgroundColor: PALETTE.spyLine }}
                />{" "}
                SPY
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="h-0.5 w-4 rounded-full"
                  style={{ backgroundColor: PALETTE.sma50 }}
                />{" "}
                SMA 50
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="h-0.5 w-4 rounded-full"
                  style={{ backgroundColor: PALETTE.sma200 }}
                />{" "}
                SMA 200
              </span>
            </>
          ) : vsSpy ? (
            <>
              <span className="flex items-center gap-1.5">
                <span
                  className="h-0.5 w-4 rounded-full"
                  style={{ backgroundColor: "var(--dashboard-chart-portfolio-line)" }}
                />{" "}
                Portfolio
              </span>
              {showSpyLine ? (
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-0.5 w-4 rounded-full"
                    style={{ backgroundColor: "var(--dashboard-chart-benchmark-line)" }}
                  />{" "}
                  S&amp;P 500
                </span>
              ) : (
                <span className="opacity-80">S&amp;P — {loading ? "…" : "unavailable"}</span>
              )}
            </>
          ) : (
            <span className="flex items-center gap-1.5">
              <span
                className="h-0.5 w-4 rounded-full"
                style={{ backgroundColor: "var(--dashboard-chart-portfolio-line)" }}
              />{" "}
              Portfolio value
            </span>
          )}
        </div>
        <div className="relative z-[1] h-full pt-11">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-subtle">Loading chart…</div>
          ) : lineData.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-subtle">
              {showSpyOnlyChart
                ? "Unable to load S&P 500 history yet."
                : "Check back later to see history as it gets built."}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {showSpyOnlyChart ? (
                <LineChart key={chartKey} data={lineData} margin={{ top: 6, right: 10, left: 2, bottom: 22 }}>
                  <XAxis
                    dataKey="dateMs"
                    type="number"
                    scale="linear"
                    domain={["dataMin", "dataMax"]}
                    ticks={xTickMs.length > 0 ? xTickMs : undefined}
                    tick={{ fill: chart.tickFill, fontSize: 10 }}
                    tickFormatter={(v) => formatChartAxisDate(Number(v))}
                    tickLine={false}
                    axisLine={{ stroke: chart.referenceStroke }}
                    tickMargin={8}
                    minTickGap={0}
                  />
                  <YAxis
                    domain={spyOnlyYDomain}
                    ticks={spyOnlyYTicks.length > 0 ? spyOnlyYTicks : undefined}
                    tick={{ fill: chart.tickFill, fontSize: 10 }}
                    tickFormatter={(v) => formatWholeCurrency(Number(v))}
                    width={44}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ stroke: chart.referenceStroke, strokeWidth: 1, strokeDasharray: "4 4", opacity: 0.55 }}
                    isAnimationActive={false}
                    contentStyle={{
                      background: chart.tooltipBg,
                      border: `1px solid ${chart.tooltipBorder}`,
                      borderRadius: 10,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    }}
                    labelStyle={{ color: chart.tooltipLabelColor, fontSize: 11 }}
                    labelFormatter={(_label, payload) => {
                      const row = payload?.[0]?.payload as ComparisonChartRow | undefined;
                      return row ? formatChartTooltipHeading(row.dateMs) : "";
                    }}
                    formatter={(v: number, name: string) => {
                      if (v == null || !Number.isFinite(Number(v))) return [null, ""];
                      const label =
                        name === "sma50" || name === "SMA 50"
                          ? "SMA 50"
                          : name === "sma200" || name === "SMA 200"
                            ? "SMA 200"
                            : "SPY";
                      return [formatCurrency(Number(v)), label];
                    }}
                  />
                  <Line
                    type="linear"
                    dataKey="value"
                    name="SPY"
                    stroke={PALETTE.spyLine}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: PALETTE.spyLine }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="sma50"
                    name="SMA 50"
                    stroke={PALETTE.sma50}
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="sma200"
                    name="SMA 200"
                    stroke={PALETTE.sma200}
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              ) : vsSpy ? (
                <LineChart data={lineData} margin={{ top: 6, right: 10, left: 2, bottom: 22 }}>
                  <XAxis
                    dataKey="dateMs"
                    type="number"
                    scale="linear"
                    domain={["dataMin", "dataMax"]}
                    ticks={xTickMs.length > 0 ? xTickMs : undefined}
                    tick={{ fill: chart.tickFill, fontSize: 10 }}
                    tickFormatter={(v) => formatChartAxisDate(Number(v))}
                    tickLine={false}
                    axisLine={{ stroke: chart.referenceStroke }}
                    tickMargin={8}
                    minTickGap={0}
                  />
                  <YAxis
                    domain={pctYDomain}
                    ticks={pctYTicks.length > 0 ? pctYTicks : undefined}
                    tick={{ fill: chart.tickFill, fontSize: 10 }}
                    tickFormatter={(v) => formatPercent(Number(v), true)}
                    width={40}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ stroke: chart.referenceStroke, strokeWidth: 1, strokeDasharray: "4 4", opacity: 0.55 }}
                    isAnimationActive={false}
                    contentStyle={{
                      background: chart.tooltipBg,
                      border: `1px solid ${chart.tooltipBorder}`,
                      borderRadius: 10,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    }}
                    labelStyle={{ color: chart.tooltipLabelColor, fontSize: 11 }}
                    labelFormatter={(_label, payload) => {
                      const row = payload?.[0]?.payload as ComparisonChartRow | undefined;
                      return row ? formatChartTooltipHeading(row.dateMs) : "";
                    }}
                    formatter={(v: number, name: string) => {
                      const label =
                        name === "portfolioPct" || name === "Portfolio" ? "Portfolio" : name === "spyPct" || name === "S&P 500" ? "S&P 500" : name;
                      return [formatPercent(Number(v)), label];
                    }}
                  />
                  <ReferenceLine y={0} stroke={chart.referenceStroke} strokeDasharray="4 6" />
                  <Line
                    type="monotone"
                    dataKey="portfolioPct"
                    stroke={PALETTE.portfolioLine}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: PALETTE.portfolioLine }}
                    name="Portfolio"
                    isAnimationActive={chartAnimate}
                    animationDuration={900}
                  />
                  {showSpyLine ? (
                    <Line
                      type="monotone"
                      dataKey="spyPct"
                      stroke={PALETTE.spyLine}
                      strokeWidth={2.25}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2, stroke: PALETTE.spyLine }}
                      name="S&P 500"
                      isAnimationActive={chartAnimate}
                      animationDuration={900}
                    />
                  ) : null}
                </LineChart>
              ) : (
                <LineChart data={lineData} margin={{ top: 6, right: 10, left: 2, bottom: 22 }}>
                  <XAxis
                    dataKey="dateMs"
                    type="number"
                    scale="linear"
                    domain={["dataMin", "dataMax"]}
                    ticks={xTickMs.length > 0 ? xTickMs : undefined}
                    tick={{ fill: chart.tickFill, fontSize: 10 }}
                    tickFormatter={(v) => formatChartAxisDate(Number(v))}
                    tickLine={false}
                    axisLine={{ stroke: chart.referenceStroke }}
                    tickMargin={8}
                    minTickGap={0}
                  />
                  <YAxis
                    domain={valueYDomain}
                    ticks={valueYTicks.length > 0 ? valueYTicks : undefined}
                    tick={{ fill: chart.tickFill, fontSize: 10 }}
                    tickFormatter={(v) => formatCompactCurrency(Number(v))}
                    width={44}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ stroke: chart.referenceStroke, strokeWidth: 1, strokeDasharray: "4 4", opacity: 0.55 }}
                    isAnimationActive={false}
                    contentStyle={{
                      background: chart.tooltipBg,
                      border: `1px solid ${chart.tooltipBorder}`,
                      borderRadius: 10,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    }}
                    labelStyle={{ color: chart.tooltipLabelColor, fontSize: 11 }}
                    labelFormatter={(_label, payload) => {
                      const row = payload?.[0]?.payload as ComparisonChartRow | undefined;
                      return row ? formatChartTooltipHeading(row.dateMs) : "";
                    }}
                    formatter={(v: number) => [formatCurrency(Number(v)), "Value"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name="Portfolio value"
                    stroke={PALETTE.portfolioLine}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: PALETTE.portfolioLine }}
                    isAnimationActive={chartAnimate}
                    animationDuration={900}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>
      <div className="mt-3 space-y-1 text-[11px] leading-relaxed text-subtle">
        {showSpyOnlyChart && spyOnlyData.usedFullHistoryFallback && (
          <p>Not enough points in {CHART_RANGE_LABEL[spyDuration]} — showing all available SPY history.</p>
        )}
        {!showSpyOnlyChart && vsSpy && usedFullHistoryFallback && (
          <p>Not enough points in {CHART_RANGE_LABEL[range]} — showing all available history.</p>
        )}
        {!showSpyOnlyChart && !vsSpy && valueModeData.usedFullHistoryFallback && (
          <p>Not enough points in {CHART_RANGE_LABEL[range]} — showing all available history.</p>
        )}
        {forcedSpyOnly ? (
          <p>
            There is not enough portfolio history yet for a comparison, so this chart shows <strong>SPY market prices</strong> with 50-day and 200-day moving averages.
            Choose <strong>3M</strong> or <strong>1Y</strong>. That series comes from shared market data and does not depend on your account snapshots. The vs S&amp;P comparison
            appears after portfolio history is available.
          </p>
        ) : showSpyOnlyChart ? (
          <p>
            <strong>SPY</strong> shows market prices with 50-day and 200-day moving averages. Choose <strong>3M</strong> or <strong>1Y</strong>. Switch to <strong>vs S&amp;P</strong> or <strong>Portfolio</strong> to see your account series.
          </p>
        ) : (
          <p>
            Range buttons set the date window to <strong>3M</strong>, <strong>1Y</strong>, or <strong>Max</strong>. The chart uses <strong>one point per S&amp;P 500 trading day</strong> in that window; your portfolio line uses the latest
            saved total on or before each day. Percent change is measured from the <strong>first visible</strong> day. If the benchmark line is missing, the index series
            isn’t available for this environment yet—your portfolio line still appears when there is data.
          </p>
        )}
      </div>
    </section>
  );
}
