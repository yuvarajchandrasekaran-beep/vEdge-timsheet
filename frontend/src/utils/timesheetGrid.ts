import type { Timesheet, TimesheetEntry } from "../types";
import type { TimesheetEntryInput } from "../hooks/useTimesheets";
import { getWeekDays } from "./week";

export interface GridRow {
  projectTaskId: string;
  projectId: string;
  projectName: string;
  taskName: string;
  /** date (YYYY-MM-DD) -> raw input string, e.g. "4", "4.5", "" */
  hours: Record<string, string>;
  /** date (YYYY-MM-DD) -> per-entry note, carried through from existing entries */
  notes: Record<string, string>;
  /** From the task's Sub-Pillar and its Pillar; shown by the optional columns (see ColumnsPicker) */
  pillarName?: string;
  subPillarName?: string;
}

export function buildRowsFromTimesheet(timesheet: Timesheet | undefined, weekStart: string): GridRow[] {
  const days = getWeekDays(weekStart).map((d) => d.date);
  const byTask = new Map<string, GridRow>();

  for (const entry of timesheet?.entries ?? []) {
    let row = byTask.get(entry.projectTaskId);
    if (!row) {
      row = {
        projectTaskId: entry.projectTaskId,
        projectId: entry.projectId,
        projectName: entry.projectName,
        taskName: entry.taskName,
        pillarName: entry.pillarName ?? undefined,
        subPillarName: entry.subPillarName ?? undefined,
        hours: Object.fromEntries(days.map((d) => [d, ""])),
        notes: Object.fromEntries(days.map((d) => [d, ""])),
      };
      byTask.set(entry.projectTaskId, row);
    }
    if (days.includes(entry.entryDate)) {
      row.hours[entry.entryDate] = entry.hours ? String(entry.hours) : "";
      row.notes[entry.entryDate] = entry.notes ?? "";
    }
  }

  return Array.from(byTask.values());
}

/**
 * Same idea as buildRowsFromTimesheet, but merges entries from SEVERAL weeks'
 * timesheets into one row per project/task spanning every date in the whole
 * period — used by the Monthly/Fortnight views' single continuous grid
 * (one row per task, one column per day across the whole period, same shape
 * as the Weekly view rather than a separate mini-table per week).
 */
export function buildRowsFromTimesheets(timesheets: (Timesheet | undefined)[], allDates: string[]): GridRow[] {
  const byTask = new Map<string, GridRow>();
  const entryLists: TimesheetEntry[][] = timesheets.map((t) => t?.entries ?? []);

  for (const entries of entryLists) {
    for (const entry of entries) {
      let row = byTask.get(entry.projectTaskId);
      if (!row) {
        row = {
          projectTaskId: entry.projectTaskId,
          projectId: entry.projectId,
          projectName: entry.projectName,
          taskName: entry.taskName,
          pillarName: entry.pillarName ?? undefined,
          subPillarName: entry.subPillarName ?? undefined,
          hours: Object.fromEntries(allDates.map((d) => [d, ""])),
          notes: Object.fromEntries(allDates.map((d) => [d, ""])),
        };
        byTask.set(entry.projectTaskId, row);
      }
      if (allDates.includes(entry.entryDate)) {
        row.hours[entry.entryDate] = entry.hours ? String(entry.hours) : "";
        row.notes[entry.entryDate] = entry.notes ?? "";
      }
    }
  }

  return Array.from(byTask.values());
}

export function emptyRow(
  days: string[],
  opts: Pick<GridRow, "projectTaskId" | "projectId" | "projectName" | "taskName" | "pillarName" | "subPillarName">
): GridRow {
  return {
    ...opts,
    hours: Object.fromEntries(days.map((d) => [d, ""])),
    notes: Object.fromEntries(days.map((d) => [d, ""])),
  };
}

/**
 * After a draft save, any cell the server rejected (outside a project's
 * window, over a cap, missing a required note, no longer assigned, …) was
 * never actually persisted — but until now the grid kept showing whatever
 * the user had typed, as if it had saved. That phantom value then fed every
 * other total/validation computed from `rows` (day/week totals, the submit
 * preview, warning/blocking messages), so a rejected entry could make a week
 * look over a hard hour cap on screen while the server's own total — the one
 * actually enforced at submit — stayed well under it, or vice versa.
 * `rejectedKeys` is the `rejectedEntries` the PUT response returns, each a
 * "projectTaskId:entryDate" string; `authoritativeEntries` is that same
 * response's own `entries` — what's actually saved right now.
 */
export function reconcileRejectedEntries(
  rows: GridRow[],
  rejectedKeys: string[],
  authoritativeEntries: TimesheetEntry[]
): GridRow[] {
  if (rejectedKeys.length === 0) return rows;
  const authoritativeByKey = new Map(authoritativeEntries.map((e) => [`${e.projectTaskId}:${e.entryDate}`, e]));
  const rejectedByTask = new Map<string, string[]>();
  for (const key of rejectedKeys) {
    const [projectTaskId, entryDate] = key.split(":");
    rejectedByTask.set(projectTaskId, [...(rejectedByTask.get(projectTaskId) ?? []), entryDate]);
  }
  return rows.map((row) => {
    const dates = rejectedByTask.get(row.projectTaskId);
    if (!dates) return row;
    const hours = { ...row.hours };
    const notes = { ...row.notes };
    for (const date of dates) {
      const authoritative = authoritativeByKey.get(`${row.projectTaskId}:${date}`);
      hours[date] = authoritative ? String(authoritative.hours) : "";
      notes[date] = authoritative?.notes ?? "";
    }
    return { ...row, hours, notes };
  });
}

export function rowsToEntries(rows: GridRow[]): TimesheetEntryInput[] {
  const entries: TimesheetEntryInput[] = [];
  for (const row of rows) {
    for (const [date, raw] of Object.entries(row.hours)) {
      const hours = raw.trim() === "" ? 0 : Number(raw);
      if (Number.isNaN(hours)) continue;
      if (hours === 0 && !row.notes[date]) continue;
      entries.push({
        projectTaskId: row.projectTaskId,
        entryDate: date,
        hours,
        notes: row.notes[date] || undefined,
      });
    }
  }
  return entries;
}

export function dayTotal(rows: GridRow[], date: string): number {
  return rows.reduce((sum, row) => {
    const v = Number(row.hours[date]);
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);
}

export function rowTotal(row: GridRow): number {
  return Object.values(row.hours).reduce((sum, raw) => {
    const v = Number(raw);
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);
}

export function weekTotal(rows: GridRow[], days: string[]): number {
  return days.reduce((sum, d) => sum + dayTotal(rows, d), 0);
}
