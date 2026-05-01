"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export type DashboardChartTheme = {
  ready: boolean;
  isDark: boolean;
  tickFill: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipLabelColor: string;
  referenceStroke: string;
  legendBg: string;
  legendText: string;
  plotShellClass: string;
  gridLineClass: string;
};

export function useDashboardChartTheme(): DashboardChartTheme {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  const gridLight =
    "pointer-events-none absolute inset-0 opacity-[0.5] [background-image:linear-gradient(color-mix(in_srgb,var(--theme-foreground)_7%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_srgb,var(--theme-foreground)_7%,transparent)_1px,transparent_1px)] [background-size:28px_28px]";
  const gridDark =
    "pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(color-mix(in_srgb,var(--theme-foreground)_8%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_srgb,var(--theme-foreground)_8%,transparent)_1px,transparent_1px)] [background-size:28px_28px]";

  if (!mounted) {
    return {
      ready: false,
      isDark: true,
      tickFill: "rgba(161,161,170,0.9)",
      tooltipBg: "rgba(24,24,27,0.96)",
      tooltipBorder: "var(--dashboard-chart-tooltip-border)",
      tooltipLabelColor: "#fafafa",
      referenceStroke: "rgba(161,161,170,0.35)",
      legendBg: "rgba(24,24,27,0.92)",
      legendText: "#fafafa",
      plotShellClass:
        "relative overflow-hidden rounded-xl border border-[color:color-mix(in_srgb,var(--dashboard-chart-cost-basis)_20%,var(--theme-border))] bg-[linear-gradient(165deg,var(--dashboard-chart-surface-start)_0%,var(--dashboard-chart-surface-end)_100%)] shadow-inner",
      gridLineClass: gridDark,
    };
  }

  if (isDark) {
    return {
      ready: true,
      isDark: true,
      tickFill: "rgba(161,161,170,0.9)",
      tooltipBg: "rgba(24,24,27,0.96)",
      tooltipBorder: "var(--dashboard-chart-tooltip-border)",
      tooltipLabelColor: "#fafafa",
      referenceStroke: "rgba(161,161,170,0.35)",
      legendBg: "rgba(16,40,77,0.86)",
      legendText: "#fafafa",
      plotShellClass:
        "relative overflow-hidden rounded-xl border border-[color:color-mix(in_srgb,var(--dashboard-chart-cost-basis)_24%,var(--theme-border))] bg-[linear-gradient(165deg,var(--dashboard-chart-surface-start)_0%,var(--dashboard-chart-surface-end)_100%)] shadow-inner",
      gridLineClass: gridDark,
    };
  }

  return {
    ready: true,
    isDark: false,
    tickFill: "rgba(82,82,91,0.88)",
    tooltipBg: "rgba(255,255,255,0.98)",
    tooltipBorder: "var(--dashboard-chart-tooltip-border)",
    tooltipLabelColor: "#18181b",
    referenceStroke: "rgba(82,82,91,0.25)",
    legendBg: "rgba(255,255,255,0.88)",
    legendText: "#18181b",
    plotShellClass:
      "relative overflow-hidden rounded-xl border border-[color:color-mix(in_srgb,var(--dashboard-chart-cost-basis)_18%,var(--theme-border))] bg-[linear-gradient(165deg,var(--dashboard-chart-surface-start)_0%,var(--dashboard-chart-surface-end)_100%)] shadow-inner",
    gridLineClass: gridLight,
  };
}
