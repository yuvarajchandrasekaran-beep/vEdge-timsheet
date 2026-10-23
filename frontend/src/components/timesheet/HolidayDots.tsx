import type { Holiday } from "../../types";

/** Combined tooltip for a date with one or more holidays landing on it
 * (from different calendars) — e.g. "Thanksgiving Day (Vivid Edge Corporate
 * Calendar) • Thanksgiving Day (ServiceNow Calendar)". */
export function holidayTooltip(holidays: Holiday[]): string | undefined {
  if (holidays.length === 0) return undefined;
  return holidays.map((h) => `${h.name} (${h.calendarName})`).join(" • ");
}

/** One small dot per holiday landing on a date, colored by its calendar —
 * shows every calendar covering that day at a glance, not just the first. */
export function HolidayDots({ holidays, className = "mt-1 flex justify-center gap-0.5" }: { holidays: Holiday[]; className?: string }) {
  if (holidays.length === 0) return null;
  return (
    <div className={className}>
      {holidays.map((h) => (
        <span
          key={h.id}
          className="h-1.5 w-1.5 rounded-full ring-1 ring-white/60"
          style={{ backgroundColor: h.calendarColor }}
        />
      ))}
    </div>
  );
}
