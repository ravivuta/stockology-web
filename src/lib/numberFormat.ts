const EXACT_2 = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const MAX_2 = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

export function formatDecimal(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return EXACT_2.format(value);
}

export function formatNumberMax2(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return MAX_2.format(value);
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${formatDecimal(value)}`;
}

export function formatSignedCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "−"}$${formatDecimal(Math.abs(value))}`;
}

export function formatPercent(value: number | null | undefined, signed = false): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = signed && value >= 0 ? "+" : "";
  return `${sign}${formatDecimal(value)}%`;
}

export function formatAbsPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${formatDecimal(Math.abs(value))}%`;
}

export function formatCompactCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1e12) return `$${formatDecimal(value / 1e12)}T`;
  if (value >= 1e9) return `$${formatDecimal(value / 1e9)}B`;
  if (value >= 1e6) return `$${formatDecimal(value / 1e6)}M`;
  if (value >= 1e3) return `$${formatDecimal(value / 1e3)}K`;
  return formatCurrency(value);
}
