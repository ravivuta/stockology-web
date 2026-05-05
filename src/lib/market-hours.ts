/**
 * Mirrors the current iOS background-refresh guard.
 * The mobile app presently treats weekday 6:00-23:59 ET as the auto-refresh window.
 */
export function isIosAlignedAutoRefreshWindowOpen(date = new Date()): boolean {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(date);
  if (day === "Sat" || day === "Sun") return false;

  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(date)
  );
  return Number.isFinite(hour) && hour >= 6 && hour <= 23;
}
