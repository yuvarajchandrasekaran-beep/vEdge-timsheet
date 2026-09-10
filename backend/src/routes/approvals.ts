import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES, TIMESHEET_STATUS } from "../constants/enums";
import { writeAuditLog } from "../utils/audit";
import { notify } from "../services/notify";
import { resolveLevel1Approver, resolveLevel2Approver } from "../services/approvalRouting";
import { paginationParams, paginated } from "../utils/pagination";

const router = Router();

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function serializeQueueRow(timesheet: any, level: 1 | 2, pendingDaysOverride?: number) {
  const totalHours = timesheet.entries.reduce((s: number, e: any) => s + e.hours, 0);
  const pendingDays =
    pendingDaysOverride ??
    (timesheet.submittedAt ? Math.floor((Date.now() - new Date(timesheet.submittedAt).getTime()) / (1000 * 60 * 60 * 24)) : 0);
  return {
    timesheetId: timesheet.id,
    userId: timesheet.user.id,
    userName: timesheet.user.name,
    userAvatarUrl: null,
    userRole: timesheet.user.role.name,
    department: timesheet.user.department?.name ?? "—",
    weekStart: toIsoDate(timesheet.weekStartDate),
    weekEnd: toIsoDate(addDays(timesheet.weekStartDate, 6)),
    totalHours,
    submittedAt: timesheet.submittedAt,
    pendingDays,
    status: timesheet.status,
    level: level === 2 ? "L2" : "L1",
  };
}

const TIMESHEET_INCLUDE = { user: { include: { role: true, department: true } }, entries: true } as const;

/**
 * @swagger
 * /approvals/pending:
 *   get:
 *     summary: List timesheets in the caller's approval queue (level + status tab)
 *     tags: [Approvals]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/pending",
  requireAuth,
  requireRole(ROLES.PROJECT_ADMIN, ROLES.HR_ADMIN, ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const levelParam = String(req.query.level ?? (req.user!.role === ROLES.HR_ADMIN ? "L2" : "L1"));
    const level: 1 | 2 = levelParam === "L2" ? 2 : 1;
    const status = String(req.query.status ?? "PENDING").toUpperCase();
    const { page, pageSize, skip, take } = paginationParams(req);

    let rows: ReturnType<typeof serializeQueueRow>[] = [];

    if (status === "PENDING") {
      if (level === 1) {
        const submitted = await prisma.timesheet.findMany({
          where: { status: TIMESHEET_STATUS.SUBMITTED },
          include: TIMESHEET_INCLUDE,
          orderBy: { submittedAt: "asc" },
        });
        for (const t of submitted) {
          const { approverIds } = await resolveLevel1Approver(t.id);
          // Mirror doApprove/doReject's authorization: only SUPER_ADMIN or an
          // actual PROJECT_ADMIN-role user who is one of the resolved
          // approvers can act at Level 1 — being listed here without being
          // able to act on it would be a confusing dead end.
          if (req.user!.role === ROLES.SUPER_ADMIN || (req.user!.role === ROLES.PROJECT_ADMIN && approverIds.includes(req.user!.id))) {
            rows.push(serializeQueueRow(t, 1));
          }
        }
      } else {
        const approvedL1 = await prisma.timesheet.findMany({
          where: { status: TIMESHEET_STATUS.APPROVED_L1 },
          include: TIMESHEET_INCLUDE,
          orderBy: { submittedAt: "asc" },
        });
        rows = approvedL1.map((t) => serializeQueueRow(t, 2));
      }
    } else {
      // APPROVED / REJECTED tabs: timesheets this caller personally acted on at this level.
      const action = status === "APPROVED" ? "APPROVED" : "REJECTED";
      const approvals = await prisma.approval.findMany({
        where: { level, approverId: req.user!.id, action },
        include: { timesheet: { include: TIMESHEET_INCLUDE } },
        orderBy: { actedAt: "desc" },
      });
      rows = approvals.map((a) => {
        const pendingDays = a.timesheet.submittedAt
          ? Math.round(((a.actedAt.getTime() - new Date(a.timesheet.submittedAt).getTime()) / 86400000) * 10) / 10
          : 0;
        return serializeQueueRow(a.timesheet, level, pendingDays);
      });
    }

    const total = rows.length;
    const paged = rows.slice(skip, skip + take);
    res.json(paginated(paged, total, page, pageSize));
  })
);

async function doApprove(timesheetId: number, actor: { id: number; role: string }, comment?: string) {
  const timesheet = await prisma.timesheet.findUnique({ where: { id: timesheetId } });
  if (!timesheet) throw ApiError.notFound("Timesheet not found");

  if (timesheet.status === TIMESHEET_STATUS.SUBMITTED) {
    const { approverIds } = await resolveLevel1Approver(timesheetId);
    if (actor.role !== ROLES.SUPER_ADMIN && (actor.role !== ROLES.PROJECT_ADMIN || !approverIds.includes(actor.id))) {
      throw ApiError.forbidden("You are not the Level 1 approver for this timesheet");
    }
    await prisma.approval.create({ data: { timesheetId, level: 1, approverId: actor.id, action: "APPROVED", comment } });
    const updated = await prisma.timesheet.update({ where: { id: timesheetId }, data: { status: TIMESHEET_STATUS.APPROVED_L1 } });
    const l2 = await resolveLevel2Approver();
    if (l2) await notify(l2, "PendingApproval", "Timesheet awaiting Level 2 approval", `A timesheet has cleared Level 1 and needs your final review.`, { timesheetId });
    return updated;
  }

  if (timesheet.status === TIMESHEET_STATUS.APPROVED_L1) {
    if (actor.role !== ROLES.SUPER_ADMIN && actor.role !== ROLES.HR_ADMIN) {
      throw ApiError.forbidden("Only HR Admin can give Level 2 (final) approval");
    }
    await prisma.approval.create({ data: { timesheetId, level: 2, approverId: actor.id, action: "APPROVED", comment } });
    const updated = await prisma.timesheet.update({ where: { id: timesheetId }, data: { status: TIMESHEET_STATUS.APPROVED_L2 } });
    await notify(updated.userId, "FinalApproval", "Timesheet fully approved", `Your timesheet for the week of ${toIsoDate(updated.weekStartDate)} has received final approval.`, { timesheetId });
    return updated;
  }

  throw ApiError.conflict(`Timesheet is "${timesheet.status}" and is not pending approval.`);
}

async function doReject(timesheetId: number, actor: { id: number; role: string }, comment: string) {
  const timesheet = await prisma.timesheet.findUnique({ where: { id: timesheetId } });
  if (!timesheet) throw ApiError.notFound("Timesheet not found");

  let level: 1 | 2;
  if (timesheet.status === TIMESHEET_STATUS.SUBMITTED) {
    const { approverIds } = await resolveLevel1Approver(timesheetId);
    if (actor.role !== ROLES.SUPER_ADMIN && (actor.role !== ROLES.PROJECT_ADMIN || !approverIds.includes(actor.id))) {
      throw ApiError.forbidden("You are not the Level 1 approver for this timesheet");
    }
    level = 1;
  } else if (timesheet.status === TIMESHEET_STATUS.APPROVED_L1) {
    if (actor.role !== ROLES.SUPER_ADMIN && actor.role !== ROLES.HR_ADMIN) {
      throw ApiError.forbidden("Only HR Admin can reject at Level 2");
    }
    level = 2;
  } else {
    throw ApiError.conflict(`Timesheet is "${timesheet.status}" and is not pending approval.`);
  }

  await prisma.approval.create({ data: { timesheetId, level, approverId: actor.id, action: "REJECTED", comment } });
  const updated = await prisma.timesheet.update({ where: { id: timesheetId }, data: { status: TIMESHEET_STATUS.REJECTED } });
  await notify(updated.userId, "Rejection", "Timesheet rejected", comment, { timesheetId, level });
  return updated;
}

const commentSchema = z.object({ comment: z.string().optional() });
const rejectSchema = z.object({ comment: z.string().min(1, "A comment is required to reject a timesheet") });

/**
 * @swagger
 * /approvals/{timesheetId}/approve:
 *   post:
 *     summary: Approve at the caller's level
 *     tags: [Approvals]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/:timesheetId/approve",
  requireAuth,
  requireRole(ROLES.PROJECT_ADMIN, ROLES.HR_ADMIN, ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { comment } = commentSchema.parse(req.body ?? {});
    const updated = await doApprove(Number(req.params.timesheetId), req.user!, comment);
    await writeAuditLog({ actorId: req.user!.id, entityType: "Timesheet", entityId: updated.id, action: "Approve", after: updated });
    res.json(updated);
  })
);

/**
 * @swagger
 * /approvals/{timesheetId}/reject:
 *   post:
 *     summary: Reject with a required comment
 *     tags: [Approvals]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/:timesheetId/reject",
  requireAuth,
  requireRole(ROLES.PROJECT_ADMIN, ROLES.HR_ADMIN, ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { comment } = rejectSchema.parse(req.body);
    const updated = await doReject(Number(req.params.timesheetId), req.user!, comment);
    await writeAuditLog({ actorId: req.user!.id, entityType: "Timesheet", entityId: updated.id, action: "Reject", after: updated });
    res.json(updated);
  })
);

/**
 * @swagger
 * /approvals/bulk-approve:
 *   post:
 *     summary: Bulk-approve a set of timesheets at the caller's level
 *     tags: [Approvals]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/bulk-approve",
  requireAuth,
  requireRole(ROLES.PROJECT_ADMIN, ROLES.HR_ADMIN, ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { timesheetIds } = z.object({ timesheetIds: z.array(z.coerce.number()) }).parse(req.body);
    const results: { timesheetId: number; ok: boolean; error?: string }[] = [];
    for (const id of timesheetIds) {
      try {
        const updated = await doApprove(id, req.user!);
        await writeAuditLog({ actorId: req.user!.id, entityType: "Timesheet", entityId: id, action: "Approve", after: updated });
        results.push({ timesheetId: id, ok: true });
      } catch (e: any) {
        results.push({ timesheetId: id, ok: false, error: e.message });
      }
    }
    res.json({ results });
  })
);

/**
 * @swagger
 * /approvals/{timesheetId}/delegate:
 *   post:
 *     summary: Nominate a temporary proxy approver for a date range
 *     tags: [Approvals]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/:timesheetId/delegate",
  requireAuth,
  requireRole(ROLES.PROJECT_ADMIN, ROLES.HR_ADMIN, ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const body = z.object({ toUserId: z.coerce.number(), from: z.string(), to: z.string() }).parse(req.body);
    const timesheet = await prisma.timesheet.findUnique({ where: { id: Number(req.params.timesheetId) } });
    if (!timesheet) throw ApiError.notFound("Timesheet not found");
    const delegation = await prisma.delegation.create({
      data: { fromUserId: req.user!.id, toUserId: body.toUserId, startDate: new Date(body.from), endDate: new Date(body.to) },
    });
    await writeAuditLog({ actorId: req.user!.id, entityType: "Delegation", entityId: delegation.id, action: "Create", after: delegation });
    res.status(201).json(delegation);
  })
);

export default router;
