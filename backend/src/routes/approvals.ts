import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/errors";
import { requireAuth } from "../middleware/auth";
import { ROLES, TIMESHEET_STATUS } from "../constants/enums";
import { writeAuditLog } from "../utils/audit";
import { notify } from "../services/notify";
import { isProjectAdminAnywhere, resolveApprover } from "../services/approvalRouting";
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

function serializeQueueRow(timesheet: any, pendingDaysOverride?: number) {
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
  };
}

const TIMESHEET_INCLUDE = { user: { include: { role: true, department: true } }, entries: true } as const;

/**
 * @swagger
 * /approvals/pending:
 *   get:
 *     summary: List timesheets in the caller's approval queue (status tab)
 *     tags: [Approvals]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/pending",
  requireAuth,
  asyncHandler(async (req, res) => {
    // No role gate here beyond requireAuth: a project's admin list is
    // assignable to anyone regardless of their global role (see
    // isProjectAdminAnywhere's docstring), so the real authorization is
    // per-timesheet below — an Individual User with no such membership
    // anywhere simply never matches approverIds and sees an empty queue.
    const status = String(req.query.status ?? "PENDING").toUpperCase();
    const { page, pageSize, skip, take } = paginationParams(req);

    let rows: ReturnType<typeof serializeQueueRow>[] = [];

    if (status === "PENDING") {
      const submitted = await prisma.timesheet.findMany({
        where: { status: TIMESHEET_STATUS.SUBMITTED },
        include: TIMESHEET_INCLUDE,
        orderBy: { submittedAt: "asc" },
      });
      for (const t of submitted) {
        const { approverIds } = await resolveApprover(t.id);
        // Mirrors doApprove/doReject's authorization exactly: Super Admin,
        // or anyone resolveApprover actually named (a real per-project
        // admin, or their active delegate) regardless of global role.
        if (req.user!.role === ROLES.SUPER_ADMIN || approverIds.includes(req.user!.id)) {
          rows.push(serializeQueueRow(t));
        }
      }
    } else {
      // APPROVED / REJECTED tabs: timesheets this caller personally acted on.
      const action = status === "APPROVED" ? "APPROVED" : "REJECTED";
      const approvals = await prisma.approval.findMany({
        where: { approverId: req.user!.id, action },
        include: { timesheet: { include: TIMESHEET_INCLUDE } },
        orderBy: { actedAt: "desc" },
      });
      rows = approvals.map((a) => {
        const pendingDays = a.timesheet.submittedAt
          ? Math.round(((a.actedAt.getTime() - new Date(a.timesheet.submittedAt).getTime()) / 86400000) * 10) / 10
          : 0;
        return serializeQueueRow(a.timesheet, pendingDays);
      });
    }

    const search = req.query.search ? String(req.query.search).trim().toLowerCase() : undefined;
    const department = req.query.department ? String(req.query.department).trim().toLowerCase() : undefined;
    const minPendingDays = req.query.pendingDays ? Number(req.query.pendingDays) : undefined;
    if (search) rows = rows.filter((r) => r.userName.toLowerCase().includes(search));
    if (department) rows = rows.filter((r) => r.department.toLowerCase() === department);
    if (minPendingDays !== undefined) rows = rows.filter((r) => r.pendingDays >= minPendingDays);

    const total = rows.length;
    const paged = rows.slice(skip, skip + take);
    res.json(paginated(paged, total, page, pageSize));
  })
);

async function doApprove(timesheetId: number, actor: { id: number; role: string }, comment?: string) {
  const timesheet = await prisma.timesheet.findUnique({ where: { id: timesheetId } });
  if (!timesheet) throw ApiError.notFound("Timesheet not found");
  if (timesheet.status !== TIMESHEET_STATUS.SUBMITTED) {
    throw ApiError.conflict(`Timesheet is "${timesheet.status}" and is not pending approval.`);
  }

  const { approverIds } = await resolveApprover(timesheetId);
  // approverIds already names only real per-project admins (and their
  // active delegates) regardless of the actor's global role — see
  // isProjectAdminAnywhere's docstring for why checking global role here
  // too would incorrectly block a legitimate co-administrator.
  if (actor.role !== ROLES.SUPER_ADMIN && !approverIds.includes(actor.id)) {
    throw ApiError.forbidden("You are not the approver for this timesheet");
  }
  await prisma.approval.create({ data: { timesheetId, level: 1, approverId: actor.id, action: "APPROVED", comment } });
  const updated = await prisma.timesheet.update({ where: { id: timesheetId }, data: { status: TIMESHEET_STATUS.APPROVED } });
  await notify(updated.userId, "FinalApproval", "Timesheet approved", `Your timesheet for the week of ${toIsoDate(updated.weekStartDate)} has been approved.`, { timesheetId });
  return updated;
}

async function doReject(timesheetId: number, actor: { id: number; role: string }, comment: string) {
  const timesheet = await prisma.timesheet.findUnique({ where: { id: timesheetId } });
  if (!timesheet) throw ApiError.notFound("Timesheet not found");
  if (timesheet.status !== TIMESHEET_STATUS.SUBMITTED) {
    throw ApiError.conflict(`Timesheet is "${timesheet.status}" and is not pending approval.`);
  }

  const { approverIds } = await resolveApprover(timesheetId);
  if (actor.role !== ROLES.SUPER_ADMIN && !approverIds.includes(actor.id)) {
    throw ApiError.forbidden("You are not the approver for this timesheet");
  }

  await prisma.approval.create({ data: { timesheetId, level: 1, approverId: actor.id, action: "REJECTED", comment } });
  const updated = await prisma.timesheet.update({ where: { id: timesheetId }, data: { status: TIMESHEET_STATUS.REJECTED } });
  await notify(updated.userId, "Rejection", "Timesheet rejected", comment, { timesheetId });
  return updated;
}

const commentSchema = z.object({ comment: z.string().optional() });
const rejectSchema = z.object({ comment: z.string().min(1, "A comment is required to reject a timesheet") });

/**
 * @swagger
 * /approvals/{timesheetId}/approve:
 *   post:
 *     summary: Approve a submitted timesheet
 *     tags: [Approvals]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/:timesheetId/approve",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { comment } = commentSchema.parse(req.body ?? {});
    const updated = await doApprove(Number(req.params.timesheetId), req.user!, comment);
    await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "Timesheet", entityId: updated.id, action: "Approve", after: updated });
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
  asyncHandler(async (req, res) => {
    const { comment } = rejectSchema.parse(req.body);
    const updated = await doReject(Number(req.params.timesheetId), req.user!, comment);
    await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "Timesheet", entityId: updated.id, action: "Reject", after: updated });
    res.json(updated);
  })
);

/**
 * @swagger
 * /approvals/bulk-approve:
 *   post:
 *     summary: Bulk-approve a set of timesheets
 *     tags: [Approvals]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/bulk-approve",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { timesheetIds } = z.object({ timesheetIds: z.array(z.coerce.number()) }).parse(req.body);
    const results: { timesheetId: number; ok: boolean; error?: string }[] = [];
    for (const id of timesheetIds) {
      try {
        const updated = await doApprove(id, req.user!);
        await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "Timesheet", entityId: id, action: "Approve", after: updated });
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
 * /approvals/bulk-reject:
 *   post:
 *     summary: Bulk-reject a set of timesheets with one shared comment
 *     tags: [Approvals]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/bulk-reject",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { timesheetIds, comment } = z
      .object({ timesheetIds: z.array(z.coerce.number()), comment: z.string().min(1, "A comment is required to reject") })
      .parse(req.body);
    const results: { timesheetId: number; ok: boolean; error?: string }[] = [];
    for (const id of timesheetIds) {
      try {
        const updated = await doReject(id, req.user!, comment);
        await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "Timesheet", entityId: id, action: "Reject", after: updated });
        results.push({ timesheetId: id, ok: true });
      } catch (e: any) {
        results.push({ timesheetId: id, ok: false, error: e.message });
      }
    }
    res.json({ results });
  })
);

// Nominating/listing/revoking a proxy now lives at /delegations (see
// routes/delegations.ts) — it's a general "stand in for me on this date
// range" action, not tied to any one timesheet the way this endpoint used
// to be (it took a timesheetId but never actually used it).

export default router;
