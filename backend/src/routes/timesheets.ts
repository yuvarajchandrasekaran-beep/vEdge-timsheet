import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/errors";
import { requireAuth } from "../middleware/auth";
import { validateEntries, validateWeekSubmission, hasRequiredComment, commentRequiredIssue, EntryInput } from "../services/timesheetValidation";
import { writeAuditLog } from "../utils/audit";
import { notify } from "../services/notify";
import { resolveApprover } from "../services/approvalRouting";
import { TIMESHEET_STATUS, ROLES, PROJECT_MEMBER_ROLE } from "../constants/enums";
import { buildWorkbookFromRows, rowsToCsv } from "../services/excel";
import { timesheetCode } from "../utils/timesheetCode";
import { SUB_PILLAR_INCLUDE } from "../utils/taskPillar";
import { paginationParams, paginated } from "../utils/pagination";

const router = Router();

const EDITABLE_STATUSES: string[] = [TIMESHEET_STATUS.DRAFT, TIMESHEET_STATUS.REJECTED, TIMESHEET_STATUS.RECALLED];

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function serializeTimesheet(timesheetId: number) {
  const timesheet = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    include: {
      entries: { include: { projectTask: { include: { project: true, ...SUB_PILLAR_INCLUDE } } } },
      approvals: { include: { approver: true }, orderBy: { actedAt: "asc" } },
      user: true,
    },
  });
  if (!timesheet) return null;

  const totalLogged = timesheet.entries.reduce((sum, e) => sum + e.hours, 0);
  const entryInputs: EntryInput[] = timesheet.entries.map((e) => ({
    projectTaskId: e.projectTaskId,
    entryDate: toIsoDate(e.entryDate),
    hours: e.hours,
    notes: e.notes ?? undefined,
  }));
  // Merges per-entry structural issues (assignment/window/cap/note-required)
  // with the submit-time-only checks (weekly total, holiday, mandatory
  // comment) so warnings like "this falls on a holiday" show up live in the
  // grid, not just as a submit-time surprise — see validateWeekSubmission's
  // docstring for why the latter don't also block autosave.
  const validation = [
    ...(await validateEntries(timesheet.userId, entryInputs)),
    ...(await validateWeekSubmission(entryInputs, timesheet.weekNotes)),
  ];
  if (entryInputs.some((e) => e.hours > 0) && !hasRequiredComment(entryInputs, [timesheet.weekNotes])) {
    validation.push(commentRequiredIssue(entryInputs));
  }

  return {
    id: timesheet.id,
    timesheetCode: timesheetCode(timesheet.id, timesheet.weekStartDate),
    userId: timesheet.userId,
    userName: timesheet.user.name,
    weekStart: toIsoDate(timesheet.weekStartDate),
    weekEnd: toIsoDate(addDays(timesheet.weekStartDate, 6)),
    status: timesheet.status,
    totalHours: totalLogged,
    weekNotes: timesheet.weekNotes,
    entries: timesheet.entries.map((e) => ({
      id: e.id,
      projectTaskId: e.projectTaskId,
      projectId: e.projectTask.projectId,
      projectName: e.projectTask.project.name,
      taskName: e.projectTask.name,
      pillarName: e.projectTask.subPillar?.pillar.name ?? null,
      subPillarName: e.projectTask.subPillar?.name ?? null,
      entryDate: toIsoDate(e.entryDate),
      hours: e.hours,
      notes: e.notes,
    })),
    submittedAt: timesheet.submittedAt,
    approvals: timesheet.approvals.map((a) => ({
      id: a.id,
      timesheetId: a.timesheetId,
      approverId: a.approverId,
      approverName: a.approver.name,
      action: a.action,
      comment: a.comment,
      actedAt: a.actedAt,
    })),
    updatedAt: timesheet.updatedAt,
    validation,
  };
}

/**
 * @swagger
 * /timesheets/me:
 *   get:
 *     summary: Get the current user's timesheet for a given week (creates a Draft shell if absent)
 *     tags: [Timesheets]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const weekStart = String(req.query.weekStart ?? "");
    if (!weekStart) throw ApiError.badRequest("weekStart query param is required (YYYY-MM-DD)");
    const weekStartDate = new Date(weekStart);
    if (isNaN(weekStartDate.getTime())) throw ApiError.badRequest("weekStart is not a valid date");

    let timesheet = await prisma.timesheet.findUnique({
      where: { userId_weekStartDate: { userId: req.user!.id, weekStartDate } },
    });
    if (!timesheet) {
      timesheet = await prisma.timesheet.create({ data: { userId: req.user!.id, weekStartDate, status: TIMESHEET_STATUS.DRAFT } });
    }

    // Flat Timesheet object — the frontend's useMyTimesheet hook types this
    // response directly as `Timesheet`, no wrapper. Assigned-project/task
    // options for the "add a row" typeahead come from GET /projects instead
    // (already role-scoped to "my assigned projects" for an Individual User).
    res.json(await serializeTimesheet(timesheet.id));
  })
);

/**
 * @swagger
 * /timesheets/me/history:
 *   get:
 *     summary: Last N weeks of the current user's timesheets (for the dashboard calendar/heatmap)
 *     tags: [Timesheets]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/me/history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const weeks = Math.min(52, Number(req.query.weeks ?? 12));
    const timesheets = await prisma.timesheet.findMany({
      where: { userId: req.user!.id },
      orderBy: { weekStartDate: "desc" },
      take: weeks,
    });
    // Array of full Timesheet objects (not wrapped) — useTimesheetHistory
    // types this as Timesheet[] directly.
    res.json(await Promise.all(timesheets.map((t) => serializeTimesheet(t.id))));
  })
);

/**
 * @swagger
 * /timesheets/me/period-export:
 *   get:
 *     summary: Export a Monthly/Fortnight period's timesheet grid (one row per project/task, one column per date) as CSV or Excel
 *     tags: [Timesheets]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/me/period-export",
  requireAuth,
  asyncHandler(async (req, res) => {
    const weekStarts = String(req.query.weekStarts ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (weekStarts.length === 0) throw ApiError.badRequest("weekStarts is required (comma-separated ISO dates)");
    const format = String(req.query.format ?? "xlsx");

    const timesheets = await Promise.all(
      weekStarts.map(async (ws) => {
        const weekStartDate = new Date(ws);
        if (isNaN(weekStartDate.getTime())) throw ApiError.badRequest(`Invalid weekStart "${ws}"`);
        const t = await prisma.timesheet.findUnique({
          where: { userId_weekStartDate: { userId: req.user!.id, weekStartDate } },
        });
        return t ? serializeTimesheet(t.id) : null;
      })
    );

    // Full ordered list of dates across every week (Mon..Sun each), used as
    // this export's date columns — mirrors the grid exactly as shown on
    // screen regardless of which weeks had an actual Timesheet row yet.
    const allDates: string[] = [];
    for (const ws of weekStarts) {
      const start = new Date(ws);
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setUTCDate(start.getUTCDate() + i);
        allDates.push(toIsoDate(d));
      }
    }

    const rowsByTask = new Map<number, { project: string; task: string; hours: Map<string, number> }>();
    for (const t of timesheets) {
      if (!t) continue;
      for (const e of t.entries) {
        if (!rowsByTask.has(e.projectTaskId)) {
          rowsByTask.set(e.projectTaskId, { project: e.projectName, task: e.taskName, hours: new Map() });
        }
        rowsByTask.get(e.projectTaskId)!.hours.set(e.entryDate, e.hours);
      }
    }

    const exportRows = [...rowsByTask.values()].map((r) => {
      const row: Record<string, unknown> = { Project: r.project, Task: r.task };
      let total = 0;
      for (const date of allDates) {
        const hours = r.hours.get(date) ?? 0;
        row[date] = hours || "";
        total += hours;
      }
      row["Total"] = total;
      return row;
    });

    const fileBase = `timesheet_${weekStarts[0]}_to_${weekStarts[weekStarts.length - 1]}`;
    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${fileBase}.csv"`);
      return res.send(rowsToCsv(exportRows));
    }
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileBase}.xlsx"`);
    res.send(buildWorkbookFromRows(exportRows, "Timesheet"));
  })
);

const entrySchema = z.object({
  projectTaskId: z.coerce.number(),
  entryDate: z.string(),
  hours: z.coerce.number().min(0).max(24),
  notes: z.string().optional(),
});

const upsertSchema = z.object({
  entries: z.array(entrySchema),
  weekNotes: z.string().optional(),
});

/**
 * @swagger
 * /timesheets/me/{weekStart}:
 *   put:
 *     summary: Upsert draft entries for the current user's week (autosave)
 *     tags: [Timesheets]
 *     security: [{ bearerAuth: [] }]
 */
router.put(
  "/me/:weekStart",
  requireAuth,
  asyncHandler(async (req, res) => {
    const weekStartDate = new Date(String(req.params.weekStart));
    if (isNaN(weekStartDate.getTime())) throw ApiError.badRequest("weekStart is not a valid date");
    const body = upsertSchema.parse(req.body);

    let timesheet = await prisma.timesheet.findUnique({
      where: { userId_weekStartDate: { userId: req.user!.id, weekStartDate } },
    });
    if (!timesheet) {
      timesheet = await prisma.timesheet.create({ data: { userId: req.user!.id, weekStartDate, status: TIMESHEET_STATUS.DRAFT } });
    }
    if (!EDITABLE_STATUSES.includes(timesheet.status)) {
      throw ApiError.conflict(`Timesheet is "${timesheet.status}" and can no longer be edited.`);
    }

    const issues = await validateEntries(req.user!.id, body.entries as EntryInput[]);
    const blockingIssues = issues.filter((i) => i.severity === "blocking");
    const blockingKeys = new Set(blockingIssues.map((i) => `${i.projectTaskId}:${i.entryDate}`));

    const acceptedEntries = body.entries.filter((e) => !blockingKeys.has(`${e.projectTaskId}:${e.entryDate}`));

    for (const entry of acceptedEntries) {
      await prisma.timesheetEntry.upsert({
        where: {
          timesheetId_projectTaskId_entryDate: {
            timesheetId: timesheet.id,
            projectTaskId: entry.projectTaskId,
            entryDate: new Date(entry.entryDate),
          },
        },
        update: { hours: entry.hours, notes: entry.notes },
        create: {
          timesheetId: timesheet.id,
          projectTaskId: entry.projectTaskId,
          entryDate: new Date(entry.entryDate),
          hours: entry.hours,
          notes: entry.notes,
        },
      });
    }

    if (body.weekNotes !== undefined) {
      await prisma.timesheet.update({ where: { id: timesheet.id }, data: { weekNotes: body.weekNotes } });
    }

    const result = await serializeTimesheet(timesheet.id);
    res.json({
      ...result,
      rejectedEntries: [...blockingKeys],
      // Human-readable reasons a caller can show the user — without this,
      // an over-8h cell saved with no note (or one outside a project's
      // window, over a member's hour cap, etc.) just silently vanished on
      // the next reload with no indication why.
      rejectedEntryMessages: [...new Set(blockingIssues.map((i) => i.message))],
      savedAt: new Date().toISOString(),
    });
  })
);

/**
 * @swagger
 * /timesheets/copy:
 *   post:
 *     summary: Copy hours and project/task rows from the immediately preceding period of the same length (used by Daily/Weekly/Fortnight/Monthly views' Copy feature) — comments/notes are always left blank on the copy, only time and project/task assignment carry over
 *     tags: [Timesheets]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/copy",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { weekStarts } = z.object({ weekStarts: z.array(z.string()).min(1) }).parse(req.body);
    const targetWeekStarts = weekStarts.map((ws) => {
      const d = new Date(ws);
      if (isNaN(d.getTime())) throw ApiError.badRequest(`Invalid weekStart "${ws}"`);
      return d;
    });
    // The source period is the immediately preceding block of the SAME
    // length (1 week for Weekly/Daily's own week, 2 for Fortnight, N for
    // Monthly) — each target week copies from the source week exactly one
    // period-length back, preserving day-of-week alignment within it.
    const periodLengthDays = targetWeekStarts.length * 7;

    const results = [];
    for (const weekStartDate of targetWeekStarts) {
      const priorWeekStart = addDays(weekStartDate, -periodLengthDays);
      const priorTimesheet = await prisma.timesheet.findUnique({
        where: { userId_weekStartDate: { userId: req.user!.id, weekStartDate: priorWeekStart } },
        include: { entries: true },
      });
      if (!priorTimesheet || priorTimesheet.entries.length === 0) continue;

      let timesheet = await prisma.timesheet.findUnique({
        where: { userId_weekStartDate: { userId: req.user!.id, weekStartDate } },
      });
      if (!timesheet) {
        timesheet = await prisma.timesheet.create({ data: { userId: req.user!.id, weekStartDate, status: TIMESHEET_STATUS.DRAFT } });
      }
      if (!EDITABLE_STATUSES.includes(timesheet.status)) {
        throw ApiError.conflict(`Timesheet is "${timesheet.status}" and can no longer be edited.`);
      }

      const hoursByTaskAndOffset = new Map<string, number>();
      for (const e of priorTimesheet.entries) {
        const offsetDays = Math.round((e.entryDate.getTime() - priorWeekStart.getTime()) / 86400000);
        hoursByTaskAndOffset.set(`${e.projectTaskId}:${offsetDays}`, e.hours);
      }
      const distinctTaskIds = [...new Set(priorTimesheet.entries.map((e) => e.projectTaskId))];
      for (const taskId of distinctTaskIds) {
        for (let i = 0; i < 7; i++) {
          const date = addDays(weekStartDate, i);
          const hours = hoursByTaskAndOffset.get(`${taskId}:${i}`) ?? 0;
          await prisma.timesheetEntry.upsert({
            where: { timesheetId_projectTaskId_entryDate: { timesheetId: timesheet.id, projectTaskId: taskId, entryDate: date } },
            update: { hours, notes: null },
            create: { timesheetId: timesheet.id, projectTaskId: taskId, entryDate: date, hours },
          });
        }
      }
      results.push(timesheet.id);
    }
    if (results.length === 0) throw ApiError.notFound("No prior period to copy from");

    res.json(await Promise.all(results.map((id) => serializeTimesheet(id))));
  })
);

/**
 * @swagger
 * /timesheets:
 *   get:
 *     summary: Search any user's (or users') timesheets by status/date range — Super Admin and HR Admin see everyone, a Project Admin sees only people who share a project they administer, anyone else sees nothing (see Query Log 3 #67 — approvers had no way to look up a timesheet other than the current Pending/Approved/Returned queues, which only ever show what THEY personally need to act on or have acted on)
 *     tags: [Timesheets]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = paginationParams(req);
    const userIdsParam = req.query.userIds
      ? String(req.query.userIds)
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => !isNaN(n))
      : undefined;
    const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
    const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined;
    const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined;

    // null = no restriction (Super Admin / HR Admin). Otherwise, only
    // people who share at least one project this caller administers —
    // global role isn't the right signal here either (see
    // isProjectAdminAnywhere's docstring in approvalRouting.ts).
    let allowedUserIds: number[] | null = null;
    if (req.user!.role !== ROLES.SUPER_ADMIN && req.user!.role !== ROLES.HR_ADMIN) {
      const adminOf = await prisma.projectMember.findMany({
        where: { userId: req.user!.id, roleOnProject: PROJECT_MEMBER_ROLE.PROJECT_ADMIN },
        select: { projectId: true },
      });
      const projectIds = adminOf.map((p) => p.projectId);
      const teammates = projectIds.length
        ? await prisma.projectMember.findMany({ where: { projectId: { in: projectIds } }, select: { userId: true } })
        : [];
      allowedUserIds = [...new Set(teammates.map((m) => m.userId))];
    }

    const effectiveUserIds = userIdsParam ? (allowedUserIds ? userIdsParam.filter((id) => allowedUserIds!.includes(id)) : userIdsParam) : allowedUserIds;

    const where: Prisma.TimesheetWhereInput = {
      // Excludes empty placeholder drafts (auto-created the moment a week is
      // opened, before anything's logged) from this browse/audit view.
      entries: { some: {} },
    };
    if (effectiveUserIds) where.userId = { in: effectiveUserIds };
    if (status) where.status = status;
    if (dateFrom || dateTo) {
      where.weekStartDate = {};
      if (dateFrom) (where.weekStartDate as Prisma.DateTimeFilter).gte = dateFrom;
      if (dateTo) (where.weekStartDate as Prisma.DateTimeFilter).lte = dateTo;
    }

    const [total, timesheets] = await Promise.all([
      prisma.timesheet.count({ where }),
      prisma.timesheet.findMany({
        where,
        include: { user: { include: { role: true, department: true } }, entries: true },
        orderBy: { weekStartDate: "desc" },
        skip,
        take,
      }),
    ]);

    res.json(
      paginated(
        timesheets.map((t) => ({
          id: t.id,
          timesheetCode: timesheetCode(t.id, t.weekStartDate),
          userId: t.userId,
          userName: t.user.name,
          userRole: t.user.role.name,
          department: t.user.department?.name ?? "—",
          weekStart: toIsoDate(t.weekStartDate),
          weekEnd: toIsoDate(addDays(t.weekStartDate, 6)),
          totalHours: t.entries.reduce((sum, e) => sum + e.hours, 0),
          status: t.status,
          submittedAt: t.submittedAt,
        })),
        total,
        page,
        pageSize
      )
    );
  })
);

/**
 * @swagger
 * /timesheets/{id}:
 *   get:
 *     summary: Full detail for one timesheet, including its approval trail
 *     tags: [Timesheets]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const timesheet = await prisma.timesheet.findUnique({ where: { id } });
    if (!timesheet) throw ApiError.notFound("Timesheet not found");
    if (timesheet.userId !== req.user!.id && req.user!.role === "INDIVIDUAL_USER") throw ApiError.forbidden();
    res.json(await serializeTimesheet(id));
  })
);

type TimesheetWithEntries = Prisma.TimesheetGetPayload<{ include: { entries: true } }>;

function toEntryInputs(timesheet: TimesheetWithEntries): EntryInput[] {
  return timesheet.entries.map((e) => ({
    projectTaskId: e.projectTaskId,
    entryDate: toIsoDate(e.entryDate),
    hours: e.hours,
    notes: e.notes ?? undefined,
  }));
}

/** Per-entry + per-week issues for one timesheet, excluding the mandatory-comment
 * check (that's evaluated separately, across the whole submission batch). */
async function collectSubmitIssues(timesheet: TimesheetWithEntries) {
  const entryInputs = toEntryInputs(timesheet);
  return [
    ...(await validateEntries(timesheet.userId, entryInputs)),
    ...(await validateWeekSubmission(entryInputs, timesheet.weekNotes)),
  ];
}

/** Applies the actual status transition + approval/notification side effects for
 * one timesheet — assumes validation has already passed. Shared by the single-week
 * submit route and the batch (Month/Fortnight) submit route below. */
async function performSubmit(timesheet: TimesheetWithEntries, actor: { id: number; name: string; impersonatedBy?: number | null }) {
  const { approverIds, selfAdministered } = await resolveApprover(timesheet.id);

  await prisma.timesheet.update({
    where: { id: timesheet.id },
    data: { status: TIMESHEET_STATUS.SUBMITTED, submittedAt: new Date() },
  });
  await writeAuditLog({
    actorId: actor.id,
    impersonatedById: actor.impersonatedBy ?? null,
    entityType: "Timesheet",
    entityId: timesheet.id,
    action: "Submit",
    after: timesheet,
  });

  if (selfAdministered) {
    await prisma.approval.create({
      data: { timesheetId: timesheet.id, level: 1, approverId: actor.id, action: "APPROVED", comment: "Auto-approved: submitter is a Project Admin for all logged projects." },
    });
    await prisma.timesheet.update({ where: { id: timesheet.id }, data: { status: TIMESHEET_STATUS.APPROVED } });
  } else {
    const code = timesheetCode(timesheet.id, timesheet.weekStartDate);
    for (const approverId of approverIds) {
      // Named the timesheet and submitter explicitly — multiple pending
      // notifications otherwise all read as the same generic title, with no
      // way to tell which is which without opening each one.
      await notify(
        approverId,
        "PendingApproval",
        `New timesheet awaiting your approval — ${code}`,
        `${actor.name}'s week of ${toIsoDate(timesheet.weekStartDate)} (${code}) is ready for review.`,
        { timesheetId: timesheet.id }
      );
    }
  }
}

/**
 * @swagger
 * /timesheets/{id}/submit:
 *   post:
 *     summary: Submit a draft timesheet for approval
 *     tags: [Timesheets]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/:id/submit",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const timesheet = await prisma.timesheet.findUnique({ where: { id }, include: { entries: true } });
    if (!timesheet) throw ApiError.notFound("Timesheet not found");
    if (timesheet.userId !== req.user!.id) throw ApiError.forbidden();
    if (!EDITABLE_STATUSES.includes(timesheet.status)) {
      throw ApiError.conflict(`Timesheet is already "${timesheet.status}".`);
    }
    if (timesheet.entries.length === 0) throw ApiError.badRequest("Cannot submit an empty timesheet");

    const entryInputs = toEntryInputs(timesheet);
    const issues = await collectSubmitIssues(timesheet);
    if (!hasRequiredComment(entryInputs, [timesheet.weekNotes])) issues.push(commentRequiredIssue(entryInputs));

    const blocking = issues.filter((i) => i.severity === "blocking");
    if (blocking.length > 0) {
      throw ApiError.badRequest("Timesheet has unresolved validation errors and cannot be submitted.", "VALIDATION_BLOCKED", blocking);
    }

    await performSubmit(timesheet, req.user!);
    res.json(await serializeTimesheet(id));
  })
);

/**
 * @swagger
 * /timesheets/submit-batch:
 *   post:
 *     summary: Submit several weeks at once (used by the Monthly/Fortnight views) — the mandatory-comment rule is checked once across the whole batch, not per week
 *     tags: [Timesheets]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/submit-batch",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { weekStarts } = z.object({ weekStarts: z.array(z.string()).min(1) }).parse(req.body);

    const timesheets: TimesheetWithEntries[] = [];
    for (const ws of weekStarts) {
      const weekStartDate = new Date(ws);
      if (isNaN(weekStartDate.getTime())) throw ApiError.badRequest(`Invalid weekStart "${ws}"`);
      const timesheet = await prisma.timesheet.findUnique({
        where: { userId_weekStartDate: { userId: req.user!.id, weekStartDate } },
        include: { entries: true },
      });
      // A week that's already Submitted/Approved/etc. is left out rather than
      // failing the whole batch — submitting "the rest of the period" should
      // still work even though one week in it has already moved on.
      if (timesheet && timesheet.entries.length > 0 && EDITABLE_STATUSES.includes(timesheet.status)) {
        timesheets.push(timesheet);
      }
    }
    if (timesheets.length === 0) {
      throw ApiError.badRequest("Nothing left to submit in this period — every week is already submitted or approved.");
    }

    // Per-week structural/hours/holiday issues, plus ONE mandatory-comment
    // check across every week in the batch together — a single comment
    // anywhere in the period satisfies it for the whole batch.
    const allIssues: Awaited<ReturnType<typeof collectSubmitIssues>> = [];
    const allEntryInputs: EntryInput[] = [];
    for (const t of timesheets) {
      allIssues.push(...(await collectSubmitIssues(t)));
      allEntryInputs.push(...toEntryInputs(t));
    }
    if (!hasRequiredComment(allEntryInputs, timesheets.map((t) => t.weekNotes))) {
      allIssues.push(commentRequiredIssue(allEntryInputs));
    }

    const blocking = allIssues.filter((i) => i.severity === "blocking");
    if (blocking.length > 0) {
      throw ApiError.badRequest("This period has unresolved validation errors and cannot be submitted.", "VALIDATION_BLOCKED", blocking);
    }

    for (const t of timesheets) {
      await performSubmit(t, req.user!);
    }

    res.json({ submitted: timesheets.map((t) => t.id) });
  })
);

/**
 * @swagger
 * /timesheets/{id}/recall:
 *   post:
 *     summary: Recall a submitted timesheet back to Draft (before approval only)
 *     tags: [Timesheets]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/:id/recall",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const timesheet = await prisma.timesheet.findUnique({ where: { id } });
    if (!timesheet) throw ApiError.notFound("Timesheet not found");
    if (timesheet.userId !== req.user!.id) throw ApiError.forbidden();
    if (timesheet.status !== TIMESHEET_STATUS.SUBMITTED) {
      throw ApiError.conflict("Only a Submitted timesheet pending approval can be recalled.");
    }
    const updated = await prisma.timesheet.update({ where: { id }, data: { status: TIMESHEET_STATUS.RECALLED } });
    await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "Timesheet", entityId: id, action: "Recall", after: updated });
    res.json(await serializeTimesheet(id));
  })
);

export default router;
