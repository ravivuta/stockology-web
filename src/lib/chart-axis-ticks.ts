/**
 * Recharts' default tick generation on numeric domains can pick "nice" values that are
 * uneven in calendar time once formatted as dates. These helpers place ticks at strictly
 * equal intervals in value space (linear time / linear magnitude) so pixel gaps match
 * the underlying scale.
 */

export function evenlySpacedTimeTickValues(minMs: number, maxMs: number, tickCount = 5): number[] {
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) return [];
  let a = minMs;
  let b = maxMs;
  if (b < a) [a, b] = [b, a];
  if (b === a) return [a];
  const n = Math.max(2, Math.min(8, tickCount));
  return Array.from({ length: n }, (_, i) => Math.round(a + (i / (n - 1)) * (b - a)));
}

export function evenlySpacedValueTicks(lo: number, hi: number, tickCount = 5): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  let a = lo;
  let b = hi;
  if (b < a) [a, b] = [b, a];
  if (b === a) return [a];
  const n = Math.max(2, Math.min(8, tickCount));
  return Array.from({ length: n }, (_, i) => a + (i / (n - 1)) * (b - a));
}
