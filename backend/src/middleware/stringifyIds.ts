import { NextFunction, Request, Response } from "express";

const ID_KEY = /(^id$|Id$)/;
// Calendar-date fields (no meaningful time-of-day) vs. instant/timestamp
// fields (createdAt, updatedAt, submittedAt, actedAt) follow a consistent
// naming split in this schema: *Date or exactly "date" = calendar date,
// *At = instant. Only the former needs date-only normalization.
const DATE_ONLY_KEY = /(^date$|Date$)/;

function toDateOnlyString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Two response-shape normalizations applied globally so individual route
 * serializers don't have to remember either one:
 *
 * 1. IDs as strings — the frontend's TS types declare every entity id (and
 *    FK reference) as `string`, so a value under a key literally named "id"
 *    or ending in "Id" is stringified if it's a number.
 *
 * 2. Calendar dates as date-only strings — a `Date` under a key ending in
 *    "Date" (or named "date") is formatted as "YYYY-MM-DD" in UTC, not the
 *    default full ISO-with-time-and-Z. This matters because the frontend
 *    renders dates with date-fns's `format()`, which uses the *local*
 *    timezone — formatting a full UTC timestamp like
 *    "2026-01-01T00:00:00.000Z" in a timezone behind UTC (e.g. US Central)
 *    displays "Dec 31, 2025", one day earlier than intended. A bare
 *    "2026-01-01" date-only string does not have this problem (date-fns
 *    parses it as local midnight, matching what was actually stored).
 *    Instant fields (createdAt, submittedAt, actedAt, ...) are deliberately
 *    left as full timestamps — those really do carry a time-of-day.
 */
function normalizeDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeDeep);
  if (value instanceof Date) return value;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (typeof val === "number" && ID_KEY.test(key)) {
        out[key] = String(val);
      } else if (val instanceof Date && DATE_ONLY_KEY.test(key)) {
        out[key] = toDateOnlyString(val);
      } else {
        out[key] = normalizeDeep(val);
      }
    }
    return out;
  }
  return value;
}

export function stringifyIdsMiddleware(_req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => originalJson(normalizeDeep(body))) as typeof res.json;
  next();
}
