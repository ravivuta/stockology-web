/** Light green cell fill. Dark mode uses a deep green so the cell does not glare. */
export const allGreenMetricCellClass = "bg-[#c9e6d2] text-[#005c14] dark:bg-[#245233] dark:text-[#b8edc7]";

/**
 * True when analyst rating, PEG, debt ratio, and score use green text, and
 * upside is above 25% even when that upside is not in the green band.
 * Score from 70 and analyst rating from 3.5 use the theme green.
 */
export function metricsAreAllGreen(input: {
  analystAvg?: string | null;
  peg?: number | null;
  debtToEquity?: number | null;
  score?: number | null;
  upside?: number | null;
}): boolean {
  const rating = Number.parseFloat(input.analystAvg ?? "");
  if (!Number.isFinite(rating) || rating < 3.5) return false;

  const peg = input.peg;
  if (peg == null || !Number.isFinite(peg) || peg <= 0 || peg > 1) return false;

  const debt = input.debtToEquity;
  if (debt == null || !Number.isFinite(debt) || debt < 0) return false;
  const debtRatio = debt > 1 ? debt / 100 : debt;
  if (debtRatio >= 0.5) return false;

  const score = input.score;
  if (score == null || !Number.isFinite(score) || score < 70) return false;

  const upside = input.upside;
  if (upside == null || !Number.isFinite(upside) || upside <= 25) return false;

  return true;
}
