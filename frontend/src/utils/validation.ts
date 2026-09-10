export const DAILY_HOUR_LIMIT = 8;
export const WEEKLY_HOUR_LIMIT = 40;
export const MAX_ENTRY_HOURS = 24;

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

/** Validates the week's aggregate total against the weekly limit. */
export function validateWeekTotal(total: number, limit: number = WEEKLY_HOUR_LIMIT): ValidationResult {
  if (total > limit) {
    return { level: "warning", message: `Exceeds weekly limit of ${limit}h` };
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
