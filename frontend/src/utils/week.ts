import { addDays, format, startOfWeek } from "date-fns";

/** Monday-based ISO week start, e.g. "2026-08-31" */
export function getWeekStart(date: Date = new Date()): string {
  return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function addWeeks(weekStart: string, delta: number): string {
  const d = new Date(`${weekStart}T00:00:00`);
  return format(addDays(d, delta * 7), "yyyy-MM-dd");
}

export interface WeekDay {
  date: string; // YYYY-MM-DD
  label: string; // Mon
  dayNumber: string; // 31
  isWeekend: boolean;
}

export function getWeekDays(weekStart: string): WeekDay[] {
  const start = new Date(`${weekStart}T00:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    return {
      date: format(d, "yyyy-MM-dd"),
      label: format(d, "EEE"),
      dayNumber: format(d, "d"),
      isWeekend: i >= 5,
    };
  });
}

export function getWeekEnd(weekStart: string): string {
  return getWeekDays(weekStart)[6].date;
}
