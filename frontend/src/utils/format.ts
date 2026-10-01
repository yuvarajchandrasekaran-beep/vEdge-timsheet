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

// Mirrors backend/src/services/pdfTable.ts's HEADER_OVERRIDES so the
// Reports screen's on-screen table and its PDF/Excel/CSV export use the
// exact same column labels for every report key.
const HEADER_OVERRIDES: Record<string, string> = {
  employeeId: "Employee ID",
  weekStartDate: "Week Start",
  submittedAt: "Submitted",
  approvedAt: "Approved",
  daysToDecide: "Decided In (days)",
  pendingDays: "Pending (days)",
  slaBreached: "SLA Breached",
  daysOverdue: "Days Overdue",
  utilizationPct: "Utilization %",
  budgetHours: "Budget Hours",
  loggedHours: "Logged Hours",
  thresholdExceeded: "Threshold Exceeded",
  entityType: "Entity Type",
  entityId: "Entity ID",
  timesheetStatus: "Timesheet Status",
  projectCode: "Project Code",
  clientId: "Client ID",
  projectId: "Project ID",
  userId: "User ID",
  entryCount: "Entries",
  totalHours: "Total Hours",
};

export function humanizeHeader(key: string): string {
  if (HEADER_OVERRIDES[key]) return HEADER_OVERRIDES[key];
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Generic report-row cell formatting for report keys without a fixed
 * column layout — dates/booleans/etc. arrive already formatted as strings
 * from the backend, so this mostly just fills in blanks and renders
 * booleans/numbers consistently with the PDF/Excel export. */
export function formatReportCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
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
