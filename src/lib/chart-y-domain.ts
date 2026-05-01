/** Padded [min, max] so series use vertical space (avoids a misleading 0 baseline for large values). */
export function paddedValueDomain(values: number[], padRatio = 0.1): [number, number] {
  if (values.length === 0) return [0, 1];
  let minV = Infinity;
  let maxV = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  if (!Number.isFinite(minV) || !Number.isFinite(maxV)) return [0, 1];
  if (maxV === minV) {
    const c = maxV;
    const spread = Math.max(Math.abs(c) * 0.025, Math.abs(c) * 0.01 + 1);
    return [c - spread, c + spread];
  }
  const span = maxV - minV;
  const pad = Math.max(span * padRatio, span * 0.04, 1);
  return [minV - pad, maxV + pad];
}
