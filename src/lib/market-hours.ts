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

function dateUtc(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function observedHolidayDateUtc(year: number, month: number, day: number) {
  const raw = dateUtc(year, month, day);
  const weekday = raw.getUTCDay(); // 0=Sun, 6=Sat
  if (weekday === 6) return new Date(Date.UTC(year, month - 1, day - 1));
  if (weekday === 0) return new Date(Date.UTC(year, month - 1, day + 1));
  return raw;
}

function nthWeekdayDateUtc(year: number, month: number, weekdayIos: number, ordinal: number) {
  let count = 0;
  for (let day = 1; day <= 31; day += 1) {
    const d = dateUtc(year, month, day);
    if (d.getUTCMonth() !== month - 1) break;
    const iosWeekday = d.getUTCDay() === 0 ? 1 : d.getUTCDay() + 1;
    if (iosWeekday === weekdayIos) {
      count += 1;
      if (count === ordinal) return d;
    }
  }
  return null;
}

function lastWeekdayDateUtc(year: number, month: number, weekdayIos: number) {
  for (let day = 31; day >= 1; day -= 1) {
    const d = dateUtc(year, month, day);
    if (d.getUTCMonth() !== month - 1) continue;
    const iosWeekday = d.getUTCDay() === 0 ? 1 : d.getUTCDay() + 1;
    if (iosWeekday === weekdayIos) return d;
  }
  return null;
}

// Meeus/Jones/Butcher algorithm (Gregorian calendar)
function easterSundayUtc(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dateUtc(year, month, day);
}

export function isUsMarketHoliday(date = new Date()): boolean {
  const { year, month, day } = easternParts(date);
  const target = dateUtc(year, month, day).getTime();

  const matches = (d: Date | null | undefined) => !!d && d.getTime() === target;

  // Observed fixed-date holidays
  if (matches(observedHolidayDateUtc(year, 1, 1))) return true; // New Year
  if (matches(observedHolidayDateUtc(year, 7, 4))) return true; // Independence Day
  if (matches(observedHolidayDateUtc(year, 12, 25))) return true; // Christmas
  if (year >= 2022 && matches(observedHolidayDateUtc(year, 6, 19))) return true; // Juneteenth

  // Edge case: Jan 1 observed on Dec 31 of previous year
  if (matches(observedHolidayDateUtc(year + 1, 1, 1))) return true;

  // Floating holidays
  if (matches(nthWeekdayDateUtc(year, 1, 2, 3))) return true; // MLK
  if (matches(nthWeekdayDateUtc(year, 2, 2, 3))) return true; // Presidents
  if (matches(lastWeekdayDateUtc(year, 5, 2))) return true; // Memorial
  if (matches(nthWeekdayDateUtc(year, 9, 2, 1))) return true; // Labor
  if (matches(nthWeekdayDateUtc(year, 11, 5, 4))) return true; // Thanksgiving

  // Good Friday
  const easter = easterSundayUtc(year);
  const goodFriday = new Date(Date.UTC(easter.getUTCFullYear(), easter.getUTCMonth(), easter.getUTCDate() - 2));
  if (matches(goodFriday)) return true;

  return false;
}

/** True on a US trading day (not weekend, not holiday) after extended-hours open (8 AM ET).
 * No upper cutoff — used to keep the "Today" change row visible until midnight. */
export function isUsMarketTradingDay(date = new Date()): boolean {
  const { weekday, hour, minute } = easternParts(date);
  if (weekday === 1 || weekday === 7) return false;
  if (isUsMarketHoliday(date)) return false;
  return hour * 60 + minute >= 8 * 60;
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
