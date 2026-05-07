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

function easternParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);

  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? Number.NaN);
  const year = value("year");
  const month = value("month");
  const day = value("day");
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const jsWeekday = utcDate.getUTCDay(); // 0=Sun
  return {
    year,
    month,
    day,
    weekday: jsWeekday === 0 ? 1 : jsWeekday + 1, // 1=Sun ... 7=Sat
    hour: value("hour"),
    minute: value("minute"),
  };
}

function weekdayOrdinalForMonth(year: number, month: number, day: number, weekday: number) {
  let ordinal = 0;
  for (let currentDay = 1; currentDay <= day; currentDay += 1) {
    const utcDate = new Date(Date.UTC(year, month - 1, currentDay));
    const jsWeekday = utcDate.getUTCDay(); // 0=Sun
    const iosWeekday = jsWeekday === 0 ? 1 : jsWeekday + 1; // 1=Sun ... 7=Sat
    if (iosWeekday === weekday) ordinal += 1;
  }
  return ordinal;
}

export function isUsMarketHoliday(date = new Date()): boolean {
  const { year, month, day } = easternParts(date);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const jsWeekday = utcDate.getUTCDay(); // 0=Sun
  const weekday = jsWeekday === 0 ? 1 : jsWeekday + 1; // 1=Sun ... 7=Sat
  const weekdayOrdinal = weekdayOrdinalForMonth(year, month, day, weekday);

  if (month === 1 && day === 1) return true;
  if (month === 1 && weekday === 2 && weekdayOrdinal === 3) return true;
  if (month === 2 && weekday === 2 && weekdayOrdinal === 3) return true;
  if (month === 5 && weekday === 2 && weekdayOrdinal === 5) return true;
  if (month === 7 && day === 4) return true;
  if (month === 9 && weekday === 2 && weekdayOrdinal === 1) return true;
  if (month === 11 && weekday === 5 && weekdayOrdinal === 4) return true;
  if (month === 12 && day === 25) return true;

  return false;
}

export function isUsMarketExtendedHoursOpen(date = new Date()): boolean {
  const { weekday, hour, minute } = easternParts(date);

  if (weekday === 1 || weekday === 7) return false;
  if (isUsMarketHoliday(date)) return false;

  const totalMinutes = hour * 60 + minute;
  const openMinutes = 8 * 60;
  const closeMinutes = 20 * 60;
  return totalMinutes >= openMinutes && totalMinutes < closeMinutes;
}
