"use client";

import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import {
  CHART_RANGES,
  type ChartRange,
  sliceForRange,
  rangePercentChange,
  lastSma,
  parseYmdToUtcNoon,
  type PricePoint,
} from "@/lib/stock-chart";
import { paddedValueDomain } from "@/lib/chart-y-domain";
import { evenlySpacedTimeTickValues, evenlySpacedValueTicks } from "@/lib/chart-axis-ticks";
import { useDashboardChartTheme } from "@/hooks/useDashboardChartTheme";
import { APP_CTA_FILL } from "@/lib/appCtaClasses";
import { formatCurrency, formatPercent } from "@/lib/numberFormat";
import { cn } from "@/lib/utils";

type Props = {
  symbol: string;
  smaPeriod: number;
  averageCost?: number | null;
  points: PricePoint[] | null;
  loading: boolean;
  error: string | null;
  /** Shorter chart + tighter chrome for table expand rows (watchlist, dashboard, etc.). */
  compact?: boolean;
  initialRange?: ChartRange;
  hideRangeSelector?: boolean;
};

function axisTickMs(ms: number) {
  const d = new Date(ms);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function StockHistoricalChart({
  symbol,
  smaPeriod,
  averageCost,
  points,
  loading,
  error,
  compact,
  initialRange = "3mo",
  hideRangeSelector = false,
}: Props) {
  const chart = useDashboardChartTheme();
  const [range, setRange] = useState<ChartRange>(initialRange);

  const sliced = useMemo(() => (points ? sliceForRange(points, range) : []), [points, range]);
  const chartData = useMemo(() => {
    const rows: { t: number; price: number; dateStr: string }[] = [];
    for (const p of sliced) {
      const t = parseYmdToUtcNoon(p.date);
      if (!Number.isFinite(t) || !Number.isFinite(p.close)) continue;
      rows.push({ t, price: p.close, dateStr: p.date.slice(0, 10) });
    }
    return rows;
  }, [sliced]);

  const smaValue = useMemo(() => (points ? lastSma(points, Math.min(smaPeriod, points.length)) : null), [points, smaPeriod]);
  const pct = useMemo(() => rangePercentChange(sliced), [sliced]);

  const xTickMs = useMemo(() => {
    if (chartData.length === 0) return [];
    const t0 = chartData[0]!.t;
    const t1 = chartData[chartData.length - 1]!.t;
    return evenlySpacedTimeTickValues(t0, t1, compact ? 4 : 6);
  }, [chartData, compact]);

  const priceDomain = useMemo(() => {
    const vals = chartData.map((d) => d.price);
    if (smaValue != null && smaValue > 0) vals.push(smaValue);
    if (averageCost != null && averageCost > 0) vals.push(averageCost);
    return paddedValueDomain(vals, 0.06);
  }, [chartData, smaValue, averageCost]);
  const yTickPrices = useMemo(
    () => evenlySpacedValueTicks(priceDomain[0], priceDomain[1], compact ? 4 : 5),
    [priceDomain, compact]
  );

  return (
    <div className={compact ? "space-y-2" : "space-y-3"} aria-label={`Price chart for ${symbol}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!hideRangeSelector ? (
          <div
            className={`flex flex-wrap gap-0.5 rounded-lg border border-border/80 bg-background/90 dark:border-white/10 ${compact ? "p-0.5" : "gap-1 rounded-xl p-1"}`}
          >
            {CHART_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-md font-semibold",
                  compact ? "px-2 py-1 text-[10px]" : "rounded-lg px-3 py-1.5 text-xs",
                  range === r ? cn(APP_CTA_FILL, "shadow-sm") : "text-subtle hover:text-foreground"
                )}
              >
                {r}
              </button>
            ))}
          </div>
        ) : (
          <div
            className={`inline-flex items-center rounded-full border border-border/80 bg-background/90 font-semibold uppercase tracking-[0.14em] text-subtle dark:border-white/10 ${compact ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-[11px]"}`}
          >
            {range}
          </div>
        )}
        {pct != null && (
          <span
            className={`font-bold tabular-nums ${compact ? "text-xs" : "text-sm"} ${pct >= 0 ? "text-primary" : "text-error"}`}
          >
            {formatPercent(pct, true)}
            <span className={`ml-1 font-medium text-subtle ${compact ? "text-[10px]" : "text-xs"}`}>in range</span>
          </span>
        )}
      </div>

      {loading && (
        <p className={`text-center text-sm text-subtle ${compact ? "py-4" : "py-10"}`}>Loading history…</p>
      )}
      {error && !loading && <p className={`text-center text-sm text-error ${compact ? "py-3" : "py-6"}`}>{error}</p>}
      {!loading && !error && chartData.length === 0 && (
        <p className={`text-center text-sm text-subtle ${compact ? "py-3" : "py-6"}`}>No data for this range.</p>
      )}

      {!loading && !error && chartData.length > 0 && (
        <div
          className={`${chart.plotShellClass} w-full ${compact ? "h-[150px] sm:h-[165px]" : "h-[240px] sm:h-[260px]"}`}
        >
          <div className={chart.gridLineClass} />
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 4, bottom: 4 }}>
              <XAxis
                dataKey="t"
                type="number"
                scale="linear"
                domain={["dataMin", "dataMax"]}
                ticks={xTickMs.length > 0 ? xTickMs : undefined}
                tickFormatter={(v) => axisTickMs(Number(v))}
                tick={{ fill: chart.tickFill, fontSize: compact ? 10 : 11 }}
                axisLine={{ stroke: chart.referenceStroke }}
                tickLine={false}
                minTickGap={0}
              />
              <YAxis
                domain={priceDomain}
                ticks={yTickPrices}
                allowDataOverflow={false}
                tick={{ fill: chart.tickFill, fontSize: compact ? 10 : 11 }}
                axisLine={{ stroke: chart.referenceStroke }}
                tickLine={false}
                width={compact ? 44 : 52}
                tickFormatter={(v) => formatCurrency(Number(v))}
              />
              <Tooltip
                cursor={{ stroke: chart.referenceStroke, strokeWidth: 1, strokeDasharray: "4 4", opacity: 0.55 }}
                isAnimationActive={false}
                contentStyle={{
                  background: chart.tooltipBg,
                  border: `1px solid ${chart.tooltipBorder}`,
                  borderRadius: 8,
                  fontSize: 11,
                }}
                labelStyle={{ color: chart.tooltipLabelColor, fontSize: 11 }}
                formatter={(value: number) => [formatCurrency(value), "Close"]}
                labelFormatter={(_label, payload) => {
                  const row = payload?.[0]?.payload as { dateStr?: string } | undefined;
                  return row?.dateStr ?? "";
                }}
              />
              {smaValue != null && smaValue > 0 && (
                <ReferenceLine y={smaValue} stroke={chart.referenceStroke} strokeDasharray="5 5" />
              )}
              {averageCost != null && averageCost > 0 && (
                <ReferenceLine y={averageCost} stroke="var(--theme-primary)" strokeDasharray="3 3" />
              )}
              <Line
                type="monotone"
                dataKey="price"
                stroke="var(--chart-portfolio-line)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--chart-portfolio-line)" }}
                isAnimationActive={chart.ready}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className={`flex flex-wrap gap-x-4 gap-y-1 text-foreground/75 ${compact ? "text-[10px] gap-x-3" : "text-xs gap-x-5 gap-y-2"}`}>
        <span className="flex items-center gap-2">
          <span className="h-1 w-5 shrink-0 rounded-full" style={{ background: "var(--chart-portfolio-line)" }} />{" "}
          Close price
        </span>
        {smaValue != null && smaValue > 0 && (
          <span className="flex items-center gap-2">
            <span className="h-1 w-5 shrink-0 rounded-full opacity-80" style={{ background: chart.referenceStroke }} />{" "}
            SMA ({smaPeriod})
          </span>
        )}
        {averageCost != null && averageCost > 0 && (
          <span className="flex items-center gap-2">
            <span className="h-1 w-5 shrink-0 rounded-full bg-primary" /> Avg cost
          </span>
        )}
      </div>
    </div>
  );
}
