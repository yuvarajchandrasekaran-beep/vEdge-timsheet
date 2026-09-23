export const DAILY_HOUR_LIMIT = 8;
export const WEEKLY_HOUR_LIMIT = 40;
export const MAX_ENTRY_HOURS = 24;

// Mirrors backend/src/constants/enums.ts's WEEKLY_HOUR_POLICY: under/over the
// 40h standard week is fine on its own (no warning); >50h/week warns; >70h
// blocks submission until corrected. The backend is the source of truth
// (see timesheet.validation) — these constants only drive the client-side
// preview shown before that response comes back.
export const WEEKLY_HOUR_POLICY = {
  STANDARD_HOURS: 40,
  WARNING_THRESHOLD: 50,
  MAX_HOURS: 70,
} as const;

export type ValidationLevel = "ok" | "warning" | "error";

export interface ValidationResult {
  level: ValidationLevel;
  message?: string;
}

/** Validates a single cell's raw hour value as the user types it. */
export function validateCellHours(raw: string): ValidationResult {
  if (raw.trim() === "") return { level: "ok" };
  const value = Number(raw);
  if (Number.isNaN(value)) {
    return { level: "error", message: "Enter a number" };
  }
  if (value < 0) {
    return { level: "error", message: "Hours cannot be negative" };
  }
  if (value > MAX_ENTRY_HOURS) {
    return { level: "error", message: `Cannot exceed ${MAX_ENTRY_HOURS}h in a single entry` };
  }
  const roundedToQuarter = Math.round(value * 4) / 4;
  if (Math.abs(roundedToQuarter - value) > 1e-9) {
    return { level: "warning", message: "Round to nearest 15 minutes" };
  }
  return { level: "ok" };
}

/** Validates a day's aggregate total against the daily limit. */
export function validateDayTotal(total: number, limit: number = DAILY_HOUR_LIMIT): ValidationResult {
  if (total > limit) {
    return { level: "warning", message: `Exceeds daily limit of ${limit}h` };
  }
  return { level: "ok" };
}

/**
 * Client-side preview of the weekly hour policy — under or over the standard
 * 40h week is fine on its own; only >50h warns and >70h blocks. The
 * authoritative check is the server's timesheet.validation (see
 * backend/src/services/timesheetValidation.ts's validateWeekSubmission).
 */
export function validateWeekTotal(total: number): ValidationResult {
  if (total > WEEKLY_HOUR_POLICY.MAX_HOURS) {
    return { level: "error", message: `This week totals ${total}h, above the ${WEEKLY_HOUR_POLICY.MAX_HOURS}h absolute limit — fix your entries before submitting.` };
  }
  if (total > WEEKLY_HOUR_POLICY.WARNING_THRESHOLD) {
    return { level: "warning", message: `This week totals ${total}h — well above the standard ${WEEKLY_HOUR_POLICY.STANDARD_HOURS}h week. Please double check before submitting.` };
  }
  if (total === 0) {
    return { level: "warning", message: "No hours logged this week" };
  }
  return { level: "ok" };
}

export function combineLevels(...levels: ValidationLevel[]): ValidationLevel {
  if (levels.includes("error")) return "error";
  if (levels.includes("warning")) return "warning";
  return "ok";
}
