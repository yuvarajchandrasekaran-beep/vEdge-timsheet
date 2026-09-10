import type { Timesheet } from "../types";
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

export function emptyRow(days: string[], opts: { projectTaskId: string; projectId: string; projectName: string; taskName: string }): GridRow {
  return {
    ...opts,
    hours: Object.fromEntries(days.map((d) => [d, ""])),
    notes: Object.fromEntries(days.map((d) => [d, ""])),
  };
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
