import { prisma } from "../lib/prisma";
import { WEEKLY_HOUR_POLICY } from "../constants/enums";

export type Severity = "blocking" | "warning";

export interface EntryInput {
  projectTaskId: number;
  entryDate: string; // ISO date (YYYY-MM-DD)
  hours: number;
  notes?: string;
}

export interface EntryIssue {
  projectTaskId: number;
  entryDate: string;
  severity: Severity;
  code: string;
  message: string;
}

const DAILY_NOTE_THRESHOLD_HOURS = 8;
const WARNING_DAILY_TOTAL_HOURS = 12;

/**
 * Mirrors spec Section 4.3.2 — validation runs per cell, distinguishing
 * blocking vs. warning severity. Returns one issue array; callers decide
 * whether to persist (draft autosave persists everything but surfaces
 * issues) or reject (submit blocks on any "blocking" issue).
 */
export async function validateEntries(userId: number, entries: EntryInput[]): Promise<EntryIssue[]> {
  const issues: EntryIssue[] = [];
  if (entries.length === 0) return issues;

  const taskIds = [...new Set(entries.map((e) => e.projectTaskId))];
  const tasks = await prisma.projectTask.findMany({
    where: { id: { in: taskIds } },
    include: { project: true },
  });
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const memberships = await prisma.projectMember.findMany({
    where: { userId, projectId: { in: tasks.map((t) => t.projectId) } },
  });
  const membershipByProjectId = new Map(memberships.map((m) => [m.projectId, m]));

  // Daily total across ALL projects, for the >12h cross-project warning.
  const dailyTotals = new Map<string, number>();
  // Per-project daily/weekly totals, for cap enforcement.
  const projectDailyTotals = new Map<string, number>(); // key: projectId:date
  const projectWeeklyTotals = new Map<number, number>();

  for (const entry of entries) {
    const task = taskById.get(entry.projectTaskId);
    if (!task) {
      issues.push({
        projectTaskId: entry.projectTaskId,
        entryDate: entry.entryDate,
        severity: "blocking",
        code: "TASK_NOT_FOUND",
        message: "This project/task no longer exists.",
      });
      continue;
    }

    const membership = membershipByProjectId.get(task.projectId);
    if (!membership) {
      issues.push({
        projectTaskId: entry.projectTaskId,
        entryDate: entry.entryDate,
        severity: "blocking",
        code: "NOT_ASSIGNED",
        message: `You are not assigned to "${task.project.name}". Ask your Project Admin to add you.`,
      });
      continue;
    }

    if (task.project.status === "ARCHIVED" || task.project.status === "COMPLETED") {
      issues.push({
        projectTaskId: entry.projectTaskId,
        entryDate: entry.entryDate,
        severity: "blocking",
        code: "PROJECT_CLOSED",
        message: `"${task.project.name}" is ${task.project.status.toLowerCase()} and read-only for time entry.`,
      });
      continue;
    }

    if (!task.active) {
      issues.push({
        projectTaskId: entry.projectTaskId,
        entryDate: entry.entryDate,
        severity: "blocking",
        code: "TASK_INACTIVE",
        message: `"${task.name}" is inactive.`,
      });
      continue;
    }

    const entryDate = new Date(entry.entryDate);
    const projectStart = new Date(task.project.startDate);
    const projectEnd = task.project.endDate ? new Date(task.project.endDate) : null;
    const taskStart = task.startDate ? new Date(task.startDate) : null;
    const taskEnd = task.endDate ? new Date(task.endDate) : null;

    if (entryDate < projectStart || (projectEnd && entryDate > projectEnd)) {
      issues.push({
        projectTaskId: entry.projectTaskId,
        entryDate: entry.entryDate,
        severity: "blocking",
        code: "OUTSIDE_PROJECT_WINDOW",
        message: `Outside "${task.project.name}"'s active window (${projectStart.toISOString().slice(0, 10)}${
          projectEnd ? ` – ${projectEnd.toISOString().slice(0, 10)}` : " onward"
        }).`,
      });
      continue;
    }

    if ((taskStart && entryDate < taskStart) || (taskEnd && entryDate > taskEnd)) {
      issues.push({
        projectTaskId: entry.projectTaskId,
        entryDate: entry.entryDate,
        severity: "blocking",
        code: "OUTSIDE_TASK_WINDOW",
        message: `Outside "${task.name}"'s active date window.`,
      });
      continue;
    }

    if (entry.hours > DAILY_NOTE_THRESHOLD_HOURS && !entry.notes?.trim()) {
      issues.push({
        projectTaskId: entry.projectTaskId,
        entryDate: entry.entryDate,
        severity: "blocking",
        code: "NOTE_REQUIRED",
        message: `A note is required for entries over ${DAILY_NOTE_THRESHOLD_HOURS}h on "${task.name}".`,
      });
    }

    const dayKey = entry.entryDate;
    dailyTotals.set(dayKey, (dailyTotals.get(dayKey) ?? 0) + entry.hours);

    const projDayKey = `${task.projectId}:${entry.entryDate}`;
    const newProjDayTotal = (projectDailyTotals.get(projDayKey) ?? 0) + entry.hours;
    projectDailyTotals.set(projDayKey, newProjDayTotal);
    if (membership.maxHoursPerDay && newProjDayTotal > membership.maxHoursPerDay) {
      issues.push({
        projectTaskId: entry.projectTaskId,
        entryDate: entry.entryDate,
        severity: "blocking",
        code: "DAILY_CAP_EXCEEDED",
        message: `Exceeds the ${membership.maxHoursPerDay}h/day cap on "${task.project.name}" (${newProjDayTotal}h logged).`,
      });
    }

    const newProjWeekTotal = (projectWeeklyTotals.get(task.projectId) ?? 0) + entry.hours;
    projectWeeklyTotals.set(task.projectId, newProjWeekTotal);
    if (membership.maxHoursPerWeek && newProjWeekTotal > membership.maxHoursPerWeek) {
      issues.push({
        projectTaskId: entry.projectTaskId,
        entryDate: entry.entryDate,
        severity: "blocking",
        code: "WEEKLY_CAP_EXCEEDED",
        message: `Exceeds the ${membership.maxHoursPerWeek}h/week cap on "${task.project.name}" (${newProjWeekTotal}h logged this week).`,
      });
    }
  }

  for (const [dayKey, total] of dailyTotals.entries()) {
    if (total > WARNING_DAILY_TOTAL_HOURS) {
      const entriesForDay = entries.filter((e) => e.entryDate === dayKey);
      for (const e of entriesForDay) {
        issues.push({
          projectTaskId: e.projectTaskId,
          entryDate: dayKey,
          severity: "warning",
          code: "HIGH_DAILY_TOTAL",
          message: `Unusually high total for this day (${total}h across all projects). Confirm before proceeding.`,
        });
      }
    }
  }

  return issues;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Submit-time-only checks — deliberately NOT run by the draft autosave PUT
 * (validateEntries above), so drafting never loses work or gets blocked.
 * Enforced only when actually submitting one week (routes/timesheets.ts's
 * /:id/submit) or a batch of them (/submit-batch, for the Month/Fortnight
 * views): a week's own total hours, whether any entry falls on a company
 * holiday, and whether the submission has at least one comment anywhere.
 */
export async function validateWeekSubmission(weekEntries: EntryInput[], weekNotes: string | null | undefined): Promise<EntryIssue[]> {
  const issues: EntryIssue[] = [];
  const active = weekEntries.filter((e) => e.hours > 0);
  if (active.length === 0) return issues;

  const totalHours = active.reduce((sum, e) => sum + e.hours, 0);
  if (totalHours > WEEKLY_HOUR_POLICY.MAX_HOURS) {
    for (const e of active) {
      issues.push({
        projectTaskId: e.projectTaskId,
        entryDate: e.entryDate,
        severity: "blocking",
        code: "WEEKLY_MAX_EXCEEDED",
        message: `This week totals ${totalHours}h, above the ${WEEKLY_HOUR_POLICY.MAX_HOURS}h absolute limit — fix your entries before submitting.`,
      });
    }
  } else if (totalHours > WEEKLY_HOUR_POLICY.WARNING_THRESHOLD) {
    for (const e of active) {
      issues.push({
        projectTaskId: e.projectTaskId,
        entryDate: e.entryDate,
        severity: "warning",
        code: "WEEKLY_HIGH_TOTAL",
        message: `This week totals ${totalHours}h — well above the standard ${WEEKLY_HOUR_POLICY.STANDARD_HOURS}h week. Please double check before submitting.`,
      });
    }
  }

  const dates = [...new Set(active.map((e) => e.entryDate))].map((d) => new Date(d));
  if (dates.length > 0) {
    const holidays = await prisma.holiday.findMany({ where: { date: { in: dates } } });
    if (holidays.length > 0) {
      const holidayByDate = new Map(holidays.map((h) => [toIsoDate(h.date), h.name]));
      for (const e of active) {
        const holidayName = holidayByDate.get(e.entryDate);
        if (holidayName) {
          issues.push({
            projectTaskId: e.projectTaskId,
            entryDate: e.entryDate,
            severity: "warning",
            code: "HOLIDAY_ENTRY",
            message: `${e.entryDate} is ${holidayName} — please confirm this time entry is legitimate before submitting.`,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Split out from validateWeekSubmission because the mandatory-comment rule
 * applies to the whole submission *batch*, not per-week — submitting a
 * month via the Monthly view needs only ONE comment anywhere across all its
 * weeks, not one in every single week. Single-week submit calls this with
 * just that week's own entries/notes; batch submit calls it once with the
 * union across every week being submitted together.
 */
export function hasRequiredComment(entries: EntryInput[], weekNotesList: (string | null | undefined)[]): boolean {
  const activeHasComment = entries.some((e) => e.hours > 0 && e.notes?.trim());
  const weekNoteHasComment = weekNotesList.some((n) => n?.trim());
  return activeHasComment || weekNoteHasComment;
}

export function commentRequiredIssue(entries: EntryInput[]): EntryIssue {
  const anchor = entries.find((e) => e.hours > 0) ?? entries[0];
  return {
    projectTaskId: anchor.projectTaskId,
    entryDate: anchor.entryDate,
    severity: "blocking",
    code: "COMMENT_REQUIRED",
    message: "At least one comment is required before submitting — add a note on any entry, or use the notes field.",
  };
}
