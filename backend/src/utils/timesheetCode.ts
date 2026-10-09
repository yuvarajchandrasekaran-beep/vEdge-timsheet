/** Human-facing timesheet reference (e.g. "TS-2026-07") — shown in the UI
 * and quoted back in approval notifications so an approver/submitter can
 * reference a specific timesheet precisely instead of just "your timesheet". */
export function timesheetCode(id: number, weekStartDate: Date): string {
  return `TS-${weekStartDate.getUTCFullYear()}-${String(id).padStart(2, "0")}`;
}
