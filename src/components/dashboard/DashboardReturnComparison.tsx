"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { useReducedMotion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { usePortfolioStore } from "@/store/portfolioStore";
import { useDashboardChartTheme } from "@/hooks/useDashboardChartTheme";
import { hasSupabaseConfig, createClient } from "@/lib/supabase/client";
import { resolveStocksPmDataUserId } from "@/lib/resolve-stocks-pm-data-user-id";
import { fetchTickerHydrationFromTables } from "@/lib/ticker-direct-hydration";
import {
  computeLivePortfolioTotal,
  fetchCloudNetWorthHistory,
  finalizeNetWorthSeries,
  type NetWorthPoint,
} from "@/lib/portfolio-net-worth-series";
import {
  CHART_RANGE_LABEL,
  CHART_RANGE_ORDER,
  type ChartRangePreset,
  filterDataByRange,
} from "@/lib/chart-range-presets";
import { paddedValueDomain } from "@/lib/chart-y-domain";
import { evenlySpacedTimeTickValues, evenlySpacedValueTicks } from "@/lib/chart-axis-ticks";
import { APP_CTA_FILL } from "@/lib/appCtaClasses";
import { formatCompactCurrency, formatCurrency, formatPercent } from "@/lib/numberFormat";
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
} as const;

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

  const [vsSpy, setVsSpy] = useState(true);
  const [range, setRange] = useState<ChartRangePreset>("1y");
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
          setCloudPts([]);
          setExternalCashFlows([]);
        }
        return;
      }
      try {
        const supabase = createClient();
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) {
          if (!cancelled) setCloudPts([]);
          return;
        }
        const dataUserId = await resolveStocksPmDataUserId(supabase, uid);
        const rows = await fetchCloudNetWorthHistory(supabase, dataUserId);
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
  }, []);

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

  const loading = cloudPts === null || meta === null || spySeries === null || externalCashFlows === null;
  const chartAnimate = !reduceMotion && chart.ready;
  const lineData = vsSpy ? comparisonRows : valueModeData.rows;
  const showSpyLine = vsSpy && spyLoadedOk && spyAligned && comparisonRows.length > 0;
  // When data count changes significantly (e.g., post-reset from multi-month to 1 point),
  // remount the chart to prevent Recharts animation leaving stale lines outside the new domain.
  const chartKey = `${comparisonRows.length}-${valueModeData.rows.length}`;

  const xTickMs = useMemo(() => {
    if (lineData.length === 0) return [];
    const sorted = [...lineData].sort((a, b) => a.dateMs - b.dateMs);
    return evenlySpacedTimeTickValues(sorted[0]!.dateMs, sorted[sorted.length - 1]!.dateMs, 5);
  }, [lineData]);

  const pctYTicks = useMemo(() => evenlySpacedValueTicks(pctYDomain[0], pctYDomain[1], 5), [pctYDomain]);
  const valueYTicks = useMemo(() => evenlySpacedValueTicks(valueYDomain[0], valueYDomain[1], 5), [valueYDomain]);

  return (
    <section className="dashboard-panel p-5 text-foreground sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Return comparison</h2>
          <p className="mt-0.5 text-xs text-subtle">
            {vsSpy ? "Cumulative % vs S&P 500 (SPY), adjusted for external cash flows" : "Portfolio value over time"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex flex-wrap gap-1 rounded-lg border border-border bg-background/80 p-1 shadow-sm dark:bg-white/5"
            role="group"
            aria-label="Chart time range"
          >
            {CHART_RANGE_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRange(key)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  range === key
                    ? cn(APP_CTA_FILL, "shadow-sm")
                    : "text-subtle hover:bg-muted/80 hover:text-foreground dark:hover:bg-white/10"
                )}
              >
                {CHART_RANGE_LABEL[key]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setVsSpy(!vsSpy)}
            className="ui-hover-pop flex items-center gap-1.5 rounded-lg border border-border bg-background/90 px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 dark:border-white/10 dark:bg-white/5 dark:hover:border-primary/35"
          >
            {vsSpy ? <Eye className="h-3.5 w-3.5 opacity-90" aria-hidden /> : <EyeOff className="h-3.5 w-3.5 opacity-90" aria-hidden />}
            {vsSpy ? "vs S&P" : "Portfolio"}
          </button>
        </div>
      </div>
      <div className={`${chart.plotShellClass} h-[220px] sm:h-[248px]`}>
        <div className={chart.gridLineClass} />
        <div
          className="absolute left-3 top-3 z-10 flex flex-wrap gap-3 rounded-lg px-2 py-1.5 text-[10px] font-medium shadow-sm backdrop-blur-md"
          style={{ backgroundColor: chart.legendBg, color: chart.legendText }}
        >
          {vsSpy ? (
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
              Check back later to see history as it gets built.
            </div>
          ) : (
            <ResponsiveContainer key={chartKey} width="100%" height="100%">
              {vsSpy ? (
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
        {vsSpy && usedFullHistoryFallback && (
          <p>Not enough points in {CHART_RANGE_LABEL[range]} — showing all available history.</p>
        )}
        {!vsSpy && valueModeData.usedFullHistoryFallback && (
          <p>Not enough points in {CHART_RANGE_LABEL[range]} — showing all available history.</p>
        )}
        <p>
          Range buttons set the date window. The chart uses <strong>one point per S&amp;P 500 trading day</strong> in that window; your portfolio line uses the latest
          saved total on or before each day. Percent change is measured from the <strong>first visible</strong> day. If the benchmark line is missing, the index series
          isn’t available for this environment yet—your portfolio line still appears when there is data.
        </p>
      </div>
    </section>
  );
}
