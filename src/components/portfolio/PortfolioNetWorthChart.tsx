"use client";

import { useEffect, useMemo, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useReducedMotion } from "framer-motion";
import type { StockHolding, TradeJournalEntry } from "@/store/portfolioStore";
import { useDashboardChartTheme } from "@/hooks/useDashboardChartTheme";
import { hasSupabaseConfig, createClient } from "@/lib/supabase/client";
import { resolveStocksPmDataUserId } from "@/lib/resolve-stocks-pm-data-user-id";
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
import { formatCompactCurrency, formatCurrency } from "@/lib/numberFormat";
import { cn } from "@/lib/utils";

const LINE_COLOR = "var(--dashboard-chart-portfolio-line)";

export type NetWorthRangePreset = ChartRangePreset;

function axisDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function tooltipHeading(ms: number) {
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type Props = {
  stocks: StockHolding[];
  cash: number;
  tradeJournal: TradeJournalEntry[];
};

export function PortfolioNetWorthChart({ stocks, cash, tradeJournal }: Props) {
  const reduceMotion = useReducedMotion();
  const chart = useDashboardChartTheme();
  const liveTotal = useMemo(() => computeLivePortfolioTotal(stocks, cash), [stocks, cash]);
  const [range, setRange] = useState<NetWorthRangePreset>("1y");

  const [cloudPts, setCloudPts] = useState<NetWorthPoint[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCloudPts(null);

    async function run() {
      if (!hasSupabaseConfig()) {
        if (!cancelled) setCloudPts([]);
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
        if (!cancelled) setCloudPts(rows);
      } catch {
        if (!cancelled) setCloudPts([]);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const meta = useMemo(() => {
    if (cloudPts === null) return null;
    return finalizeNetWorthSeries(cloudPts, tradeJournal, liveTotal);
  }, [cloudPts, tradeJournal, liveTotal]);

  const chartData = useMemo(() => {
    const pts = meta?.points ?? [];
    return pts.map((p) => ({
      t: p.t,
      value: p.value,
      label: axisDate(p.t),
    }));
  }, [meta]);

  const { filtered: filteredChartData, usedFullHistoryFallback } = useMemo(
    () => filterDataByRange(chartData, range),
    [chartData, range]
  );

  const yDomain = useMemo(
    () => paddedValueDomain(filteredChartData.map((d) => d.value)),
    [filteredChartData]
  );

  const xTickMs = useMemo(() => {
    if (filteredChartData.length === 0) return [];
    const t0 = filteredChartData[0]!.t;
    const t1 = filteredChartData[filteredChartData.length - 1]!.t;
    return evenlySpacedTimeTickValues(t0, t1, 5);
  }, [filteredChartData]);

  const yTickValues = useMemo(() => evenlySpacedValueTicks(yDomain[0], yDomain[1], 5), [yDomain]);

  const chartAnimate = !reduceMotion && chart.ready;
  const loading = cloudPts === null || meta === null;

  const caption =
    meta?.source === "cloud"
      ? "Daily totals from your account (U.S. market calendar dates), ending with today’s live portfolio value."
      : meta?.source === "journal"
        ? "Estimated from recorded trades using each trade’s price; positions added without trades aren’t reflected in the past."
        : "No dated history yet—the line shows your current total. Use the mobile app while signed in, or record trades from stock details, to build a timeline.";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-[11px] font-medium tabular-nums text-subtle">
          {loading ? "Loading history…" : `Now ${formatCurrency(liveTotal)}`}
        </p>
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
      </div>
      <div className={`${chart.plotShellClass} h-[240px] sm:h-[260px]`}>
        <div className={chart.gridLineClass} />
        <div className="relative z-[1] h-full pt-2">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-subtle">Loading chart…</div>
          ) : filteredChartData.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-subtle">No data to plot.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredChartData} margin={{ top: 10, right: 12, left: 2, bottom: 6 }}>
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="linear"
                  domain={["dataMin", "dataMax"]}
                  ticks={xTickMs.length > 0 ? xTickMs : undefined}
                  tick={{ fill: chart.tickFill, fontSize: 10 }}
                  tickFormatter={(v) => axisDate(Number(v))}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={0}
                />
                <YAxis
                  domain={yDomain}
                  ticks={yTickValues}
                  allowDataOverflow={false}
                  tick={{ fill: chart.tickFill, fontSize: 10 }}
                  tickFormatter={(v) => {
                    const n = Number(v);
                    return formatCompactCurrency(n);
                  }}
                  width={52}
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
                  labelFormatter={(_, payload) => {
                    const row = payload?.[0]?.payload as { t?: number } | undefined;
                    return row?.t != null ? tooltipHeading(row.t) : "";
                  }}
                  formatter={(v: number) => [formatCurrency(v), "Net worth"]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={LINE_COLOR}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: LINE_COLOR }}
                  isAnimationActive={chartAnimate}
                  animationDuration={700}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      {!loading && usedFullHistoryFallback && (
        <p className="text-[11px] text-subtle">
          Not enough points in {CHART_RANGE_LABEL[range]} — showing all available history.
        </p>
      )}
      {!loading && <p className="text-[11px] leading-relaxed text-subtle">{caption}</p>}
    </div>
  );
}
