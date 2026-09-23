import { endOfMonth, format, startOfMonth } from "date-fns";
import { addWeeks, getWeekStart } from "./week";

export type PeriodKind = "fortnight" | "month";

/** The 2 consecutive Monday-starting weeks making up a fortnight, anchored at its first week. */
export function getFortnightWeekStarts(anchorWeekStart: string): string[] {
  return [anchorWeekStart, addWeeks(anchorWeekStart, 1)];
}

/**
 * Every Monday-starting week that overlaps the calendar month containing
 * `anchorDate` — i.e. from the Monday of the week holding the 1st through
 * the Sunday of the week holding the last day. Like a calendar grid, the
 * first/last week can spill a few days into the adjacent month; that's
 * expected (and those days still belong to a real week's timesheet).
 */
export function getCalendarMonthWeekStarts(anchorDate: string): string[] {
  const monthStart = startOfMonth(new Date(`${anchorDate}T00:00:00`));
  const monthEnd = endOfMonth(monthStart);
  const firstWeekStart = getWeekStart(monthStart);
  const weekStarts: string[] = [];
  let cursor = firstWeekStart;
  while (new Date(`${cursor}T00:00:00`) <= monthEnd) {
    weekStarts.push(cursor);
    cursor = addWeeks(cursor, 1);
  }
  return weekStarts;
}

/** Moves a Fortnight/Monthly anchor date forward/back by whole periods. */
export function shiftPeriodAnchor(kind: PeriodKind, anchorDate: string, delta: number): string {
  if (kind === "fortnight") {
    return addWeeks(getWeekStart(new Date(`${anchorDate}T00:00:00`)), delta * 2);
  }
  const d = new Date(`${anchorDate}T00:00:00`);
  d.setMonth(d.getMonth() + delta);
  return format(d, "yyyy-MM-dd");
}

export function periodLabel(kind: PeriodKind, anchorDate: string, weekStarts: string[]): string {
  if (kind === "month") {
    return format(new Date(`${anchorDate}T00:00:00`), "MMMM yyyy");
  }
  const start = new Date(`${weekStarts[0]}T00:00:00`);
  const end = new Date(`${addWeeks(weekStarts[weekStarts.length - 1], 1)}T00:00:00`);
  end.setDate(end.getDate() - 1);
  return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
}
