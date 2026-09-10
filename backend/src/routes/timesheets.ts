import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/errors";
import { requireAuth } from "../middleware/auth";
import { validateEntries, EntryInput } from "../services/timesheetValidation";
import { writeAuditLog } from "../utils/audit";
import { notify } from "../services/notify";
import { resolveLevel1Approver, resolveLevel2Approver } from "../services/approvalRouting";
import { TIMESHEET_STATUS } from "../constants/enums";

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

function toApprovalLevel(level: number): "L1" | "L2" {
  return level === 2 ? "L2" : "L1";
}

function timesheetCode(id: number, weekStartDate: Date): string {
  return `TS-${weekStartDate.getUTCFullYear()}-${String(id).padStart(2, "0")}`;
}

async function serializeTimesheet(timesheetId: number) {
  const timesheet = await prisma.timesheet.findUnique({
    where: { id: timesheetId },
    include: {
      entries: { include: { projectTask: { include: { project: true } } } },
      approvals: { include: { approver: true }, orderBy: { actedAt: "asc" } },
      user: true,
    },
  });
  if (!timesheet) return null;

  const totalLogged = timesheet.entries.reduce((sum, e) => sum + e.hours, 0);
  const validation = await validateEntries(
    timesheet.userId,
    timesheet.entries.map((e) => ({
      projectTaskId: e.projectTaskId,
      entryDate: toIsoDate(e.entryDate),
      hours: e.hours,
      notes: e.notes ?? undefined,
    }))
  );

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
      entryDate: toIsoDate(e.entryDate),
      hours: e.hours,
      notes: e.notes,
    })),
    submittedAt: timesheet.submittedAt,
    approvals: timesheet.approvals.map((a) => ({
      id: a.id,
      timesheetId: a.timesheetId,
      level: toApprovalLevel(a.level),
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
    const blockingKeys = new Set(
      issues.filter((i) => i.severity === "blocking").map((i) => `${i.projectTaskId}:${i.entryDate}`)
    );

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
    res.json({ ...result, rejectedEntries: [...blockingKeys], savedAt: new Date().toISOString() });
  })
);

/**
 * @swagger
 * /timesheets/copy-last-week:
 *   post:
 *     summary: Pre-fill a week's project/task rows from the prior week (hours reset to zero)
 *     tags: [Timesheets]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/copy-last-week",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { weekStart } = z.object({ weekStart: z.string() }).parse(req.body);
    const weekStartDate = new Date(weekStart);
    const priorWeekStart = addDays(weekStartDate, -7);

    const priorTimesheet = await prisma.timesheet.findUnique({
      where: { userId_weekStartDate: { userId: req.user!.id, weekStartDate: priorWeekStart } },
      include: { entries: true },
    });
    if (!priorTimesheet) throw ApiError.notFound("No prior week to copy from");

    let timesheet = await prisma.timesheet.findUnique({
      where: { userId_weekStartDate: { userId: req.user!.id, weekStartDate } },
    });
    if (!timesheet) {
      timesheet = await prisma.timesheet.create({ data: { userId: req.user!.id, weekStartDate, status: TIMESHEET_STATUS.DRAFT } });
    }
    if (!EDITABLE_STATUSES.includes(timesheet.status)) {
      throw ApiError.conflict(`Timesheet is "${timesheet.status}" and can no longer be edited.`);
    }

    const distinctTaskIds = [...new Set(priorTimesheet.entries.map((e) => e.projectTaskId))];
    for (const taskId of distinctTaskIds) {
      for (let i = 0; i < 7; i++) {
        const date = addDays(weekStartDate, i);
        await prisma.timesheetEntry.upsert({
          where: { timesheetId_projectTaskId_entryDate: { timesheetId: timesheet.id, projectTaskId: taskId, entryDate: date } },
          update: {},
          create: { timesheetId: timesheet.id, projectTaskId: taskId, entryDate: date, hours: 0 },
        });
      }
    }

    res.json(await serializeTimesheet(timesheet.id));
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

    const issues = await validateEntries(
      timesheet.userId,
      timesheet.entries.map((e) => ({ projectTaskId: e.projectTaskId, entryDate: toIsoDate(e.entryDate), hours: e.hours, notes: e.notes ?? undefined }))
    );
    const blocking = issues.filter((i) => i.severity === "blocking");
    if (blocking.length > 0) {
      throw ApiError.badRequest("Timesheet has unresolved validation errors and cannot be submitted.", "VALIDATION_BLOCKED", blocking);
    }

    const { approverIds, selfAdministered } = await resolveLevel1Approver(id);

    const updated = await prisma.timesheet.update({
      where: { id },
      data: { status: TIMESHEET_STATUS.SUBMITTED, submittedAt: new Date() },
    });
    await writeAuditLog({ actorId: req.user!.id, entityType: "Timesheet", entityId: id, action: "Submit", after: updated });

    if (selfAdministered) {
      await prisma.approval.create({
        data: { timesheetId: id, level: 1, approverId: req.user!.id, action: "APPROVED", comment: "Auto-approved: submitter is a Project Admin for all logged projects." },
      });
      await prisma.timesheet.update({ where: { id }, data: { status: TIMESHEET_STATUS.APPROVED_L1 } });
      // Auto-approving L1 here skips doApprove's notify-L2 step, so it must
      // be replicated here — otherwise a self-administered submission (e.g.
      // a Project Admin logging their own time) never reaches HR's queue.
      const l2 = await resolveLevel2Approver();
      if (l2) {
        await notify(l2, "PendingApproval", "Timesheet awaiting Level 2 approval", `${req.user!.name}'s week of ${toIsoDate(timesheet.weekStartDate)} has cleared Level 1 (auto-approved) and needs your final review.`, { timesheetId: id });
      }
    } else if (approverIds.length > 0) {
      for (const approverId of approverIds) {
        await notify(approverId, "PendingApproval", "New timesheet awaiting your approval", `${req.user!.name}'s week of ${toIsoDate(timesheet.weekStartDate)} is ready for Level 1 review.`, { timesheetId: id });
      }
    }

    res.json(await serializeTimesheet(id));
  })
);

/**
 * @swagger
 * /timesheets/{id}/recall:
 *   post:
 *     summary: Recall a submitted timesheet back to Draft (pre-L1 only)
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
      throw ApiError.conflict("Only a Submitted timesheet (pending Level 1) can be recalled.");
    }
    const updated = await prisma.timesheet.update({ where: { id }, data: { status: TIMESHEET_STATUS.RECALLED } });
    await writeAuditLog({ actorId: req.user!.id, entityType: "Timesheet", entityId: id, action: "Recall", after: updated });
    res.json(await serializeTimesheet(id));
  })
);

export default router;
