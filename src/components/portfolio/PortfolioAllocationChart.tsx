"use client";

import { useMemo } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { useReducedMotion } from "framer-motion";
import type { StockHolding } from "@/store/portfolioStore";
import { useDashboardChartTheme } from "@/hooks/useDashboardChartTheme";
import { paddedValueDomain } from "@/lib/chart-y-domain";
import { evenlySpacedValueTicks } from "@/lib/chart-axis-ticks";

const MAX_SLICES = 14;

/**
 * Distinct muted greens / golds / oranges (not neon). Avoids near-black and duplicate primaries.
 * Dark: slightly lighter so bars read on elevated dark surfaces.
 * Light: slightly deeper for contrast on white/off-white.
 */
const BAR_COLORS_DARK = [
  "#5f7268",
  "#6a7d62",
  "#6f7a58",
  "#7a8258",
  "#8a7d52",
  "#8f7348",
  "#957a50",
  "#9d7048",
  "#a67855",
  "#9a6850",
  "#8a6248",
  "#7a6d58",
  "#647a62",
  "#857560",
] as const;

const BAR_COLORS_LIGHT = [
  "#4a5f52",
  "#4f6348",
  "#556244",
  "#5f6a40",
  "#6a623c",
  "#6f5a38",
  "#755a36",
  "#7a5238",
  "#805540",
  "#7a4a38",
  "#6a4838",
  "#5a5248",
  "#445a4a",
  "#5a5448",
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
