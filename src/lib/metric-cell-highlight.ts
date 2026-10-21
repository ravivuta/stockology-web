/** Light green cell fill used on iOS when a value is in the green band. */
export const allGreenMetricCellClass = "bg-[#edfaf0] text-[#005c14] dark:bg-[#e6f7e8] dark:text-[#004214]";

/**
 * True when analyst rating, PEG, debt ratio, score, and upside are all in the
 * same green text bands the tables already use.
 */
export function metricsAreAllGreen(input: {
  analystAvg?: string | null;
  peg?: number | null;
  debtToEquity?: number | null;
  score?: number | null;
  upside?: number | null;
}): boolean {
  const rating = Number.parseFloat(input.analystAvg ?? "");
  if (!Number.isFinite(rating) || rating < 4) return false;

  const peg = input.peg;
  if (peg == null || !Number.isFinite(peg) || peg <= 0 || peg > 1) return false;

  const debt = input.debtToEquity;
  if (debt == null || !Number.isFinite(debt) || debt < 0) return false;
  const debtRatio = debt > 1 ? debt / 100 : debt;
  if (debtRatio >= 0.5) return false;

  const score = input.score;
  if (score == null || !Number.isFinite(score) || score < 80) return false;

  const upside = input.upside;
  if (upside == null || !Number.isFinite(upside) || upside <= 50) return false;

  return true;
}
