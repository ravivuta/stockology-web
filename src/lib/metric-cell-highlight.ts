/** Light green cell fill. Dark mode uses a deep green so the cell does not glare. */
export const allGreenMetricCellClass =
  "bg-[#c9e6d2] ring-1 ring-inset ring-elevated dark:bg-[#245233]";

/** Background for one quality cell whose value text is already green. */
export function greenTextCellClass(isGreen: boolean): string {
  return isGreen ? allGreenMetricCellClass : "";
}

/** Analyst rating text is green from 3.5, including the theme-green band. */
export function analystTextIsGreen(value: string | null | undefined): boolean {
  const rating = Number.parseFloat(value ?? "");
  return Number.isFinite(rating) && rating >= 3.5;
}

/** PEG text is green at 1.0 or below. */
export function pegTextIsGreen(peg: number | null | undefined): boolean {
  return peg != null && Number.isFinite(peg) && peg > 0 && peg <= 1;
}

/** Debt ratio text is green under 50%. */
export function debtTextIsGreen(raw: number | null | undefined): boolean {
  if (raw == null || !Number.isFinite(raw) || raw < 0) return false;
  const ratio = raw > 1 ? raw / 100 : raw;
  return ratio < 0.5;
}

/** Score text is green from 70, including the theme-green band. */
export function scoreTextIsGreen(score: number | null | undefined): boolean {
  return score != null && Number.isFinite(score) && score >= 70;
}

/** Upside text is green only above 50%. Orange 25–50% stays unfilled. */
export function upsideTextIsGreen(upside: number | null | undefined): boolean {
  return upside != null && Number.isFinite(upside) && upside > 50;
}
