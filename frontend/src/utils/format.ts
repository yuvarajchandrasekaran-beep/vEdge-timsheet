import { format, parseISO } from "date-fns";

/** 4.5 -> "4h 30m"; 8 -> "8h 00m"; 0 -> "0h 00m" */
export function formatHoursMinutes(hours: number | undefined | null): string {
  const total = Math.round((hours ?? 0) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Compact variant used in dense table cells, e.g. "4.00" */
export function formatHoursDecimal(hours: number | undefined | null): string {
  return (hours ?? 0).toFixed(2);
}

export function formatDate(iso: string | undefined | null, pattern = "MMM d, yyyy"): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), pattern);
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string | undefined | null): string {
  return formatDate(iso, "MMM d, yyyy h:mm a");
}

export function formatWeekRange(weekStart: string, weekEnd: string): string {
  try {
    const start = parseISO(weekStart);
    const end = parseISO(weekEnd);
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  } catch {
    return `${weekStart} – ${weekEnd}`;
  }
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : plural ?? `${singular}s`;
}
