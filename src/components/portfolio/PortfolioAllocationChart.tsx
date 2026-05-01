"use client";

import { useMemo } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { useReducedMotion } from "framer-motion";
import type { StockHolding } from "@/store/portfolioStore";
import { useDashboardChartTheme } from "@/hooks/useDashboardChartTheme";
import { paddedValueDomain } from "@/lib/chart-y-domain";
import { evenlySpacedValueTicks } from "@/lib/chart-axis-ticks";

const MAX_SLICES = 14;

const BAR_COLORS_DARK = [
  "#66abf5",
  "#4dccbf",
  "#34c759",
  "#facc15",
  "#7dd3fc",
  "#93c5fd",
  "#5eead4",
  "#86efac",
  "#fde68a",
  "#a5b4fc",
  "#c4b5fd",
  "#94a3b8",
  "#67e8f9",
  "#d8b4fe",
] as const;

const BAR_COLORS_LIGHT = [
  "#3370c2",
  "#4dccbf",
  "#009900",
  "#da8800",
  "#5b9bd5",
  "#6fa8dc",
  "#76c7c0",
  "#82c58a",
  "#d4a64a",
  "#7d8cc4",
  "#9f9fc4",
  "#8b97a8",
  "#57b8cc",
  "#b59ac8",
] as const;

function fmtCurrency(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

type Props = {
  stocks: StockHolding[];
  cash: number;
};

export function PortfolioAllocationChart({ stocks, cash }: Props) {
  const reduceMotion = useReducedMotion();
  const chart = useDashboardChartTheme();

  const data = useMemo(() => {
    const held = stocks.filter((s) => s.quantity > 0);
    const rows: { name: string; value: number }[] = held.map((s) => ({
      name: s.symbol,
      value: s.quantity * (s.lastPrice ?? 0),
    }));
    if (cash > 0) rows.push({ name: "Cash", value: cash });
    rows.sort((a, b) => b.value - a.value);
    if (rows.length <= MAX_SLICES) return rows;
    const head = rows.slice(0, MAX_SLICES - 1);
    const rest = rows.slice(MAX_SLICES - 1);
    const other = rest.reduce((a, r) => a + r.value, 0);
    if (other > 0) head.push({ name: `Other (${rest.length})`, value: other });
    return head;
  }, [stocks, cash]);

  const total = useMemo(() => data.reduce((a, r) => a + r.value, 0), [data]);
  const chartAnimate = !reduceMotion && chart.ready;
  const barColors = chart.isDark ? BAR_COLORS_DARK : BAR_COLORS_LIGHT;

  const xValueDomain = useMemo(() => paddedValueDomain(data.map((r) => r.value), 0.06), [data]);
  const xValueTicks = useMemo(
    () => evenlySpacedValueTicks(xValueDomain[0], xValueDomain[1], 5),
    [xValueDomain]
  );

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background/40 px-4 py-10 text-center dark:bg-white/5">
        <p className="text-sm font-medium text-foreground">Nothing to chart yet</p>
        <p className="mt-1 text-xs text-subtle">Add holdings or cash to see allocation by position.</p>
      </div>
    );
  }

  const tickFmt = (v: number) => {
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
    return `$${Math.round(v)}`;
  };

  const plotHeight = Math.min(420, Math.max(220, 56 + data.length * 36));

  return (
    <div className={`${chart.plotShellClass} min-h-[220px]`} style={{ height: plotHeight }}>
      <div className={chart.gridLineClass} />
      <div className="relative z-[1] flex h-full flex-col pt-3">
        <div className="px-4 pb-2">
          <p className="text-[11px] font-medium tabular-nums text-subtle">
            Total {fmtCurrency(total)}
          </p>
        </div>
        <div className="min-h-0 flex-1 px-2 pb-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
              barCategoryGap="12%"
            >
              <XAxis
                type="number"
                scale="linear"
                domain={xValueDomain}
                ticks={xValueTicks}
                tick={{ fill: chart.tickFill, fontSize: 10 }}
                tickFormatter={tickFmt}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={52}
                tick={{ fill: chart.tickFill, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "color-mix(in srgb, var(--theme-foreground) 6%, transparent)" }}
                isAnimationActive={false}
                contentStyle={{
                  background: chart.tooltipBg,
                  border: `1px solid ${chart.tooltipBorder}`,
                  borderRadius: 10,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                }}
                labelStyle={{ color: chart.tooltipLabelColor, fontSize: 11 }}
                formatter={(v: number) => [fmtCurrency(v), "Value"]}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={chartAnimate} animationDuration={600}>
                {data.map((_, i) => (
                  <Cell key={`cell-${i}`} fill={barColors[i % barColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
