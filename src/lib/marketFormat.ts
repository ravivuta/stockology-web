/** Compact USD market cap for tables (e.g. $1.25B). */
export function formatMarketCapCompact(value: number | undefined | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${Math.round(value).toLocaleString()}`;
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
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}
