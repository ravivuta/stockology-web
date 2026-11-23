/** Shared ETF hatch: even 45° / 135° lines in a 4×4 tile (same as the donut SVG). */

export const ETF_HATCH_TILE_PX = 4;
export const ETF_HATCH_STROKE_PX = 0.95;
export const ETF_HATCH_SECONDARY_OPACITY = 0.74;

export const ETF_HATCH_DIAGONAL_D = "M -2,4 L 2,0 M 0,4 L 4,0 M 2,4 L 6,0";
export const ETF_HATCH_CROSS_D = "M -2,0 L 2,4 M 0,0 L 4,4 M 2,0 L 6,4";

/**
 * CSS `repeating-linear-gradient` periods run perpendicular to the stripes.
 * The SVG tile draws wrap-around diagonals every TILE/2 along x/y, so
 * perpendicular spacing is (TILE/2) / √2 — not TILE (that looked too sparse on bars).
 */
export const ETF_HATCH_CSS_PERIOD_PX = ETF_HATCH_TILE_PX / (2 * Math.SQRT2);

export function etfPatternStrokeFor(baseColor: string): string {
  return `color-mix(in srgb, ${baseColor} 52%, black)`;
}

/** CSS hatch matching the donut SVG: equal spacing, same stroke, second axis at 74% opacity. */
export function etfHatchBackgroundImage(baseColor: string): string {
  const stripe = etfPatternStrokeFor(baseColor);
  const line = ETF_HATCH_STROKE_PX;
  const period = ETF_HATCH_CSS_PERIOD_PX;
  const secondary = `color-mix(in srgb, ${stripe} ${Math.round(ETF_HATCH_SECONDARY_OPACITY * 100)}%, transparent)`;
  return (
    `repeating-linear-gradient(45deg, ${stripe} 0 ${line}px, transparent ${line}px ${period}px), ` +
    `repeating-linear-gradient(135deg, ${secondary} 0 ${line}px, transparent ${line}px ${period}px)`
  );
}
