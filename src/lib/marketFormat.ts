import { formatCompactCurrency, formatPercent } from "@/lib/numberFormat";

/** Compact USD market cap for tables (e.g. $1.25B). */
export function formatMarketCapCompact(value: number | undefined | null): string {
  return formatCompactCurrency(value);
}

/**
 * Implied upside from analyst price target vs last price (%).
 * Returns null when inputs are missing or invalid.
 */
export function analystTargetUpsidePct(lastPrice: number | undefined | null, analystTarget: number | undefined | null): number | null {
  if (lastPrice == null || !Number.isFinite(lastPrice) || lastPrice <= 0) return null;
  if (analystTarget == null || !Number.isFinite(analystTarget) || analystTarget <= 0) return null;
  return ((analystTarget - lastPrice) / lastPrice) * 100;
}

export function formatUpsidePct(pct: number | null): string {
  if (pct == null) return "—";
  return formatPercent(pct, true);
}
