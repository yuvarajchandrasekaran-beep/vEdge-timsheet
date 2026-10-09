import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/errors";
import { requireAuth } from "../middleware/auth";
import { ROLES, PROJECT_MEMBER_ROLE } from "../constants/enums";
import { writeAuditLog } from "../utils/audit";
import { isProjectAdminAnywhere } from "../services/approvalRouting";

const router = Router();

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Delegation isn't gated by global role (see isProjectAdminAnywhere's
 * docstring in approvalRouting.ts) — anyone who's a real admin on at least
 * one project, or Super Admin, can nominate/manage a proxy. */
async function assertCanManageDelegations(user: { id: number; role: string }) {
  if (user.role === ROLES.SUPER_ADMIN) return;
  if (await isProjectAdminAnywhere(user.id)) return;
  throw ApiError.forbidden("Only a project admin or Super Admin can manage delegations");
}

function serialize(d: { id: number; fromUserId: number; toUserId: number; startDate: Date; endDate: Date; active: boolean; fromUser?: { name: string }; toUser?: { name: string } }) {
  return {
    id: d.id,
    fromUserId: d.fromUserId,
    fromUserName: d.fromUser?.name,
    toUserId: d.toUserId,
    toUserName: d.toUser?.name,
    startDate: toIsoDate(d.startDate),
    endDate: toIsoDate(d.endDate),
    active: d.active,
  };
}

/**
 * @swagger
 * /delegations:
 *   get:
 *     summary: List the current user's own nominated approval proxies (as the delegator)
 *     tags: [Delegations]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    await assertCanManageDelegations(req.user!);
    const delegations = await prisma.delegation.findMany({
      where: { fromUserId: req.user!.id },
      include: { fromUser: true, toUser: true },
      orderBy: { startDate: "desc" },
    });
    res.json({ data: delegations.map(serialize) });
  })
);

/**
 * @swagger
 * /delegations/eligible-proxies:
 *   get:
 *     summary: List the users who can actually be nominated as an approval proxy (Super Admin, or a real admin on at least one project) — anyone else would be a delegation that can never approve anything
 *     tags: [Delegations]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/eligible-proxies",
  requireAuth,
  asyncHandler(async (req, res) => {
    await assertCanManageDelegations(req.user!);
    const [superAdmins, projectAdminMemberships] = await Promise.all([
      prisma.user.findMany({
        where: { status: "ACTIVE", role: { name: ROLES.SUPER_ADMIN } },
        select: { id: true, name: true },
      }),
      prisma.projectMember.findMany({
        where: { roleOnProject: PROJECT_MEMBER_ROLE.PROJECT_ADMIN, user: { status: "ACTIVE" } },
        select: { user: { select: { id: true, name: true } }, project: { select: { name: true } } },
      }),
    ]);
    // A person can be eligible either globally (Super Admin) or by admining
    // one or more specific projects — surfacing *why* avoids the confusing
    // "they're not even a Project Admin!" read of someone whose global role
    // is something else (HR Admin, say) while a project's admin list still
    // names them (see isProjectAdminAnywhere's docstring).
    const byId = new Map<number, { id: number; name: string; reason: string }>();
    for (const u of superAdmins) byId.set(u.id, { id: u.id, name: u.name, reason: "Super Admin" });
    const projectNamesByUser = new Map<number, string[]>();
    for (const m of projectAdminMemberships) {
      const list = projectNamesByUser.get(m.user.id) ?? [];
      list.push(m.project.name);
      projectNamesByUser.set(m.user.id, list);
    }
    for (const m of projectAdminMemberships) {
      if (byId.has(m.user.id)) continue;
      const projectNames = projectNamesByUser.get(m.user.id) ?? [];
      byId.set(m.user.id, { id: m.user.id, name: m.user.name, reason: `Project Admin: ${projectNames.join(", ")}` });
    }
    byId.delete(req.user!.id);
    const eligible = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
    res.json({ data: eligible });
  })
);

const createSchema = z
  .object({
    toUserId: z.coerce.number(),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
  })
  .refine((b) => new Date(b.endDate) >= new Date(b.startDate), { message: "End date must be on or after the start date" });

/**
 * @swagger
 * /delegations:
 *   post:
 *     summary: Nominate a temporary proxy approver for a date range — any timesheet this user would normally approve during that window also routes to the proxy
 *     tags: [Delegations]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    await assertCanManageDelegations(req.user!);
    const body = createSchema.parse(req.body);
    if (body.toUserId === req.user!.id) throw ApiError.badRequest("You can't delegate to yourself");

    // doApprove/doReject accept anyone Super Admin OR actually named in
    // approverIds — which resolveApprover only ever populates with Super
    // Admin or a real per-project admin. Nominating anyone else would
    // record a delegation that can never actually approve anything.
    const toUser = await prisma.user.findUnique({ where: { id: body.toUserId }, include: { role: true } });
    if (!toUser) throw ApiError.notFound("That user doesn't exist");
    if (toUser.role.name !== ROLES.SUPER_ADMIN && !(await isProjectAdminAnywhere(toUser.id))) {
      throw ApiError.badRequest("Only a Super Admin, or someone who already administers at least one project, can be nominated as an approval proxy");
    }

    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    const overlapping = await prisma.delegation.findFirst({
      where: {
        fromUserId: req.user!.id,
        toUserId: body.toUserId,
        active: true,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    if (overlapping) {
      throw ApiError.badRequest(
        `${toUser.name} is already your proxy from ${toIsoDate(overlapping.startDate)} to ${toIsoDate(overlapping.endDate)} — revoke it first or pick a non-overlapping range.`
      );
    }

    const delegation = await prisma.delegation.create({
      data: {
        fromUserId: req.user!.id,
        toUserId: body.toUserId,
        startDate,
        endDate,
      },
      include: { fromUser: true, toUser: true },
    });
    await writeAuditLog({
      actorId: req.user!.id,
      impersonatedById: req.user!.impersonatedBy ?? null,
      entityType: "Delegation",
      entityId: delegation.id,
      action: "Create",
      after: delegation,
    });
    res.status(201).json(serialize(delegation));
  })
);

/**
 * @swagger
 * /delegations/{id}:
 *   delete:
 *     summary: Revoke a nominated proxy (only the delegator or a Super Admin)
 *     tags: [Delegations]
 *     security: [{ bearerAuth: [] }]
 */
router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const delegation = await prisma.delegation.findUnique({ where: { id } });
    if (!delegation) throw ApiError.notFound("Delegation not found");
    // Only the delegator (who could only have created it by already passing
    // assertCanManageDelegations) or a Super Admin may revoke it.
    if (delegation.fromUserId !== req.user!.id && req.user!.role !== ROLES.SUPER_ADMIN) {
      throw ApiError.forbidden("You can only revoke your own delegations");
    }
    const updated = await prisma.delegation.update({ where: { id }, data: { active: false } });
    await writeAuditLog({
      actorId: req.user!.id,
      impersonatedById: req.user!.impersonatedBy ?? null,
      entityType: "Delegation",
      entityId: id,
      action: "Revoke",
      before: delegation,
      after: updated,
    });
    res.status(204).send();
  })
);

export default router;
