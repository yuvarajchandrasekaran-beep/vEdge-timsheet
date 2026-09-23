/**
 * Computes the 11 US federal holidays (per OPM) for a given year, using UTC
 * dates so results line up with the date-only convention used everywhere
 * else in this codebase (new Date("YYYY-MM-DD") parses as UTC midnight).
 * Fixed-date holidays that land on a weekend are shifted to the "observed"
 * weekday per the standard federal rule (Saturday -> preceding Friday,
 * Sunday -> following Monday) since that's the day most employers actually
 * treat as the day off.
 */

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function observedDate(date: Date): Date {
  const day = date.getUTCDay();
  if (day === 6) return utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 1);
  if (day === 0) return utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  return date;
}

// 0-based month, 0 = Sunday..6 = Saturday, n = 1st/2nd/3rd/4th occurrence.
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const first = utcDate(year, month, 1);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return utcDate(year, month, 1 + offset + (n - 1) * 7);
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const lastDay = utcDate(year, month + 1, 0);
  const offset = (lastDay.getUTCDay() - weekday + 7) % 7;
  return utcDate(year, month, lastDay.getUTCDate() - offset);
}

export interface ComputedHoliday {
  name: string;
  date: Date;
}

export function computeUsFederalHolidays(year: number): ComputedHoliday[] {
  return [
    { name: "New Year's Day", date: observedDate(utcDate(year, 0, 1)) },
    { name: "Birthday of Martin Luther King, Jr.", date: nthWeekdayOfMonth(year, 0, 1, 3) },
    { name: "Washington's Birthday", date: nthWeekdayOfMonth(year, 1, 1, 3) },
    { name: "Memorial Day", date: lastWeekdayOfMonth(year, 4, 1) },
    { name: "Juneteenth National Independence Day", date: observedDate(utcDate(year, 5, 19)) },
    { name: "Independence Day", date: observedDate(utcDate(year, 6, 4)) },
    { name: "Labor Day", date: nthWeekdayOfMonth(year, 8, 1, 1) },
    { name: "Columbus Day", date: nthWeekdayOfMonth(year, 9, 1, 2) },
    { name: "Veterans Day", date: observedDate(utcDate(year, 10, 11)) },
    { name: "Thanksgiving Day", date: nthWeekdayOfMonth(year, 10, 4, 4) },
    { name: "Christmas Day", date: observedDate(utcDate(year, 11, 25)) },
  ];
}
