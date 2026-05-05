"use client";

import { useEffect, useMemo, useState } from "react";
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
  smaOptions?: number[];
  smaStorageKey?: string;
  averageCost?: number | null;
  points: PricePoint[] | null;
  loading: boolean;
  error: string | null;
  /** Shorter chart + tighter chrome for table expand rows (watchlist, dashboard, etc.). */
  compact?: boolean;
  initialRange?: ChartRange;
  hideRangeSelector?: boolean;
  allowedRanges?: ChartRange[];
};

function chartRangeLabel(range: ChartRange): string {
  if (range === "1w") return "1W";
  if (range === "1mo") return "1MO";
  if (range === "3mo") return "3MO";
  if (range === "6mo") return "6MO";
  if (range === "1y") return "1Y";
  return "5Y";
}

function axisTickMs(ms: number) {
  const d = new Date(ms);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function smaStroke(period: number): string {
  if (period <= 50) return "#f59e0b";
  if (period >= 200) return "#60a5fa";
  return "#94a3b8";
}

export function StockHistoricalChart({
  symbol,
  smaPeriod,
  smaOptions,
  smaStorageKey,
  averageCost,
  points,
  loading,
  error,
  compact,
  initialRange = "3mo",
  hideRangeSelector = false,
  allowedRanges,
}: Props) {
  const chart = useDashboardChartTheme();
  const rangeOptions = useMemo(() => {
    if (!allowedRanges || allowedRanges.length === 0) return CHART_RANGES;
    return allowedRanges;
  }, [allowedRanges]);
  const resolvedSmaOptions = useMemo(() => {
    const next = smaOptions?.filter((value) => Number.isFinite(value) && value > 1) ?? [];
    return next.length > 0 ? next : [smaPeriod];
  }, [smaOptions, smaPeriod]);
  const [range, setRange] = useState<ChartRange>(rangeOptions.includes(initialRange) ? initialRange : rangeOptions[0] ?? "3mo");
  const [selectedSmaPeriod, setSelectedSmaPeriod] = useState<number>(
    resolvedSmaOptions.includes(smaPeriod) ? smaPeriod : (resolvedSmaOptions[0] ?? smaPeriod)
  );

  useEffect(() => {
    if (!rangeOptions.includes(range)) {
      setRange(rangeOptions.includes(initialRange) ? initialRange : rangeOptions[0] ?? "3mo");
    }
  }, [initialRange, range, rangeOptions]);

  useEffect(() => {
    if (!resolvedSmaOptions.includes(selectedSmaPeriod)) {
      setSelectedSmaPeriod(resolvedSmaOptions.includes(smaPeriod) ? smaPeriod : (resolvedSmaOptions[0] ?? smaPeriod));
    }
  }, [resolvedSmaOptions, selectedSmaPeriod, smaPeriod]);

  useEffect(() => {
    if (!smaStorageKey || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(smaStorageKey);
      if (!raw) return;
      const parsed = Number.parseInt(raw, 10);
      if (resolvedSmaOptions.includes(parsed)) {
        setSelectedSmaPeriod(parsed);
      }
    } catch {
      /* storage blocked */
    }
  }, [resolvedSmaOptions, smaStorageKey]);

  useEffect(() => {
    if (!smaStorageKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(smaStorageKey, String(selectedSmaPeriod));
    } catch {
      /* storage blocked */
    }
  }, [selectedSmaPeriod, smaStorageKey]);

  const sliced = useMemo(() => (points ? sliceForRange(points, range) : []), [points, range]);
  const chartData = useMemo(() => {
    if (!points || points.length === 0) return [];

    const slicedDates = new Set(sliced.map((point) => point.date.slice(0, 10)));
    if (slicedDates.size === 0) return [];

    const rows: { t: number; price: number; sma: number | null; dateStr: string }[] = [];
    let rollingSum = 0;

    for (let index = 0; index < points.length; index += 1) {
      const point = points[index]!;
      rollingSum += point.close;
      if (index >= selectedSmaPeriod) {
        rollingSum -= points[index - selectedSmaPeriod]!.close;
      }

      const dateStr = point.date.slice(0, 10);
      if (!slicedDates.has(dateStr)) continue;

      const t = parseYmdToUtcNoon(point.date);
      if (!Number.isFinite(t) || !Number.isFinite(point.close)) continue;

      rows.push({
        t,
        price: point.close,
        sma: index + 1 >= selectedSmaPeriod ? rollingSum / selectedSmaPeriod : null,
        dateStr,
      });
    }

    return rows;
  }, [points, selectedSmaPeriod, sliced]);

  const smaValue = useMemo(
    () => (points ? lastSma(points, Math.min(selectedSmaPeriod, points.length)) : null),
    [points, selectedSmaPeriod]
  );
  const pct = useMemo(() => rangePercentChange(sliced), [sliced]);

  const xTickMs = useMemo(() => {
    if (chartData.length === 0) return [];
    const t0 = chartData[0]!.t;
    const t1 = chartData[chartData.length - 1]!.t;
    return evenlySpacedTimeTickValues(t0, t1, compact ? 4 : 6);
  }, [chartData, compact]);

  const priceDomain = useMemo(() => {
    const vals = chartData.map((d) => d.price);
    for (const row of chartData) {
      if (row.sma != null && row.sma > 0) vals.push(row.sma);
    }
    if (averageCost != null && averageCost > 0) vals.push(averageCost);
    return paddedValueDomain(vals, 0.06);
  }, [chartData, averageCost]);
  const yTickPrices = useMemo(
    () => evenlySpacedValueTicks(priceDomain[0], priceDomain[1], compact ? 4 : 5),
    [priceDomain, compact]
  );

  return (
    <div className={compact ? "space-y-2" : "space-y-3"} aria-label={`Price chart for ${symbol}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!hideRangeSelector ? (
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`flex flex-wrap gap-0.5 rounded-lg border border-border/80 bg-background/90 dark:border-white/10 ${compact ? "p-0.5" : "gap-1 rounded-xl p-1"}`}
            >
              {rangeOptions.map((r) => (
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
                  {chartRangeLabel(r)}
                </button>
              ))}
            </div>
            {resolvedSmaOptions.length > 1 ? (
              <div
                className={`flex flex-wrap gap-0.5 rounded-lg border border-border/80 bg-background/90 dark:border-white/10 ${compact ? "p-0.5" : "gap-1 rounded-xl p-1"}`}
              >
                {resolvedSmaOptions.map((period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => setSelectedSmaPeriod(period)}
                    className={cn(
                      "rounded-md font-semibold",
                      compact ? "px-2 py-1 text-[10px]" : "rounded-lg px-3 py-1.5 text-xs",
                      selectedSmaPeriod === period ? cn(APP_CTA_FILL, "shadow-sm") : "text-subtle hover:text-foreground"
                    )}
                  >
                    SMA {period}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div
            className={`inline-flex items-center rounded-full border border-border/80 bg-background/90 font-semibold uppercase tracking-[0.14em] text-subtle dark:border-white/10 ${compact ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-[11px]"}`}
          >
            {chartRangeLabel(range)}
          </div>
        )}
        {pct != null && (
          <span
            className={`font-bold tabular-nums ${compact ? "text-xs" : "text-sm"} ${pct >= 0 ? "text-primary" : "text-error"}`}
          >
            {formatPercent(pct, true)}
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
              {averageCost != null && averageCost > 0 && (
                <ReferenceLine y={averageCost} stroke="var(--theme-primary)" strokeDasharray="3 3" />
              )}
              {smaValue != null && smaValue > 0 && (
                <Line
                  type="monotone"
                  dataKey="sma"
                  stroke={smaStroke(selectedSmaPeriod)}
                  strokeWidth={1.8}
                  dot={false}
                  connectNulls
                  isAnimationActive={chart.ready}
                />
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
            <span className="h-1 w-5 shrink-0 rounded-full opacity-90" style={{ background: smaStroke(selectedSmaPeriod) }} />{" "}
            SMA ({selectedSmaPeriod})
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
