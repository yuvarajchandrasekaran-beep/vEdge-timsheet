import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES } from "../constants/enums";
import { writeAuditLog } from "../utils/audit";

const router = Router();

function serialize(p: {
  id: number;
  name: string;
  subPillars?: { id: number; pillarId: number; name: string; _count?: { tasks: number } }[];
}) {
  return {
    id: p.id,
    name: p.name,
    subPillars: (p.subPillars ?? []).map((s) => ({
      id: s.id,
      pillarId: s.pillarId,
      name: s.name,
      taskCount: s._count?.tasks ?? 0,
    })),
  };
}

const PILLAR_INCLUDE = {
  subPillars: { orderBy: { name: "asc" }, include: { _count: { select: { tasks: true } } } },
} as const;

/**
 * @swagger
 * /pillars:
 *   get:
 *     summary: List Pillars with their Sub-Pillars (any signed-in user — Project Admins need it to tag tasks)
 *     tags: [Pillars]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const pillars = await prisma.pillar.findMany({ orderBy: { name: "asc" }, include: PILLAR_INCLUDE });
    res.json({ data: pillars.map(serialize) });
  })
);

const nameSchema = z.object({ name: z.string().trim().min(1) });

/**
 * @swagger
 * /pillars:
 *   post:
 *     summary: Create a Pillar (Super Admin)
 *     tags: [Pillars]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const body = nameSchema.parse(req.body);
    const existing = await prisma.pillar.findUnique({ where: { name: body.name } });
    if (existing) throw ApiError.conflict(`A Pillar named "${body.name}" already exists.`);
    const pillar = await prisma.pillar.create({ data: body, include: PILLAR_INCLUDE });
    await writeAuditLog({
      actorId: req.user!.id,
      impersonatedById: req.user!.impersonatedBy ?? null,
      entityType: "Pillar",
      entityId: pillar.id,
      action: "Create",
      after: { id: pillar.id, name: pillar.name },
    });
    res.status(201).json(serialize(pillar));
  })
);

/**
 * @swagger
 * /pillars/{id}:
 *   put:
 *     summary: Rename a Pillar (Super Admin)
 *     tags: [Pillars]
 *     security: [{ bearerAuth: [] }]
 */
router.put(
  "/:id",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const existing = await prisma.pillar.findUnique({ where: { id: Number(req.params.id) } });
    if (!existing) throw ApiError.notFound("Pillar not found");
    const body = nameSchema.parse(req.body);
    if (body.name !== existing.name) {
      const nameTaken = await prisma.pillar.findUnique({ where: { name: body.name } });
      if (nameTaken) throw ApiError.conflict(`A Pillar named "${body.name}" already exists.`);
    }
    const pillar = await prisma.pillar.update({ where: { id: existing.id }, data: body, include: PILLAR_INCLUDE });
    await writeAuditLog({
      actorId: req.user!.id,
      impersonatedById: req.user!.impersonatedBy ?? null,
      entityType: "Pillar",
      entityId: pillar.id,
      action: "Update",
      before: existing,
      after: { id: pillar.id, name: pillar.name },
    });
    res.json(serialize(pillar));
  })
);

/**
 * @swagger
 * /pillars/{id}:
 *   delete:
 *     summary: Delete a Pillar (Super Admin) — blocked while it still has Sub-Pillars, so deleting never silently untags tasks
 *     tags: [Pillars]
 *     security: [{ bearerAuth: [] }]
 */
router.delete(
  "/:id",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const existing = await prisma.pillar.findUnique({
      where: { id: Number(req.params.id) },
      include: { _count: { select: { subPillars: true } } },
    });
    if (!existing) throw ApiError.notFound("Pillar not found");
    if (existing._count.subPillars > 0) {
      throw ApiError.conflict(`"${existing.name}" still has ${existing._count.subPillars} Sub-Pillar(s) — remove them first.`);
    }
    await prisma.pillar.delete({ where: { id: existing.id } });
    await writeAuditLog({
      actorId: req.user!.id,
      impersonatedById: req.user!.impersonatedBy ?? null,
      entityType: "Pillar",
      entityId: existing.id,
      action: "Delete",
      before: { id: existing.id, name: existing.name },
    });
    res.status(204).send();
  })
);

/**
 * @swagger
 * /pillars/{id}/sub-pillars:
 *   post:
 *     summary: Add a Sub-Pillar under a Pillar (Super Admin)
 *     tags: [Pillars]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/:id/sub-pillars",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const pillar = await prisma.pillar.findUnique({ where: { id: Number(req.params.id) } });
    if (!pillar) throw ApiError.notFound("Pillar not found");
    const body = nameSchema.parse(req.body);
    const existing = await prisma.subPillar.findUnique({ where: { pillarId_name: { pillarId: pillar.id, name: body.name } } });
    if (existing) throw ApiError.conflict(`"${pillar.name}" already has a Sub-Pillar named "${body.name}".`);
    const subPillar = await prisma.subPillar.create({ data: { pillarId: pillar.id, name: body.name } });
    await writeAuditLog({
      actorId: req.user!.id,
      impersonatedById: req.user!.impersonatedBy ?? null,
      entityType: "SubPillar",
      entityId: subPillar.id,
      action: "Create",
      after: subPillar,
    });
    res.status(201).json({ id: subPillar.id, pillarId: subPillar.pillarId, name: subPillar.name, taskCount: 0 });
  })
);

/**
 * @swagger
 * /pillars/sub-pillars/{id}:
 *   put:
 *     summary: Rename a Sub-Pillar (Super Admin) — every task tagged with it shows the new name
 *     tags: [Pillars]
 *     security: [{ bearerAuth: [] }]
 */
router.put(
  "/sub-pillars/:id",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const existing = await prisma.subPillar.findUnique({ where: { id: Number(req.params.id) } });
    if (!existing) throw ApiError.notFound("Sub-Pillar not found");
    const body = nameSchema.parse(req.body);
    if (body.name !== existing.name) {
      const nameTaken = await prisma.subPillar.findUnique({ where: { pillarId_name: { pillarId: existing.pillarId, name: body.name } } });
      if (nameTaken) throw ApiError.conflict(`This Pillar already has a Sub-Pillar named "${body.name}".`);
    }
    const subPillar = await prisma.subPillar.update({
      where: { id: existing.id },
      data: body,
      include: { _count: { select: { tasks: true } } },
    });
    await writeAuditLog({
      actorId: req.user!.id,
      impersonatedById: req.user!.impersonatedBy ?? null,
      entityType: "SubPillar",
      entityId: subPillar.id,
      action: "Update",
      before: existing,
      after: { id: subPillar.id, pillarId: subPillar.pillarId, name: subPillar.name },
    });
    res.json({ id: subPillar.id, pillarId: subPillar.pillarId, name: subPillar.name, taskCount: subPillar._count.tasks });
  })
);

/**
 * @swagger
 * /pillars/sub-pillars/{id}:
 *   delete:
 *     summary: Delete a Sub-Pillar (Super Admin) — blocked while tasks are still tagged with it
 *     tags: [Pillars]
 *     security: [{ bearerAuth: [] }]
 */
router.delete(
  "/sub-pillars/:id",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const existing = await prisma.subPillar.findUnique({
      where: { id: Number(req.params.id) },
      include: { _count: { select: { tasks: true } } },
    });
    if (!existing) throw ApiError.notFound("Sub-Pillar not found");
    if (existing._count.tasks > 0) {
      throw ApiError.conflict(`"${existing.name}" is still set on ${existing._count.tasks} task(s) — change those tasks first.`);
    }
    await prisma.subPillar.delete({ where: { id: existing.id } });
    await writeAuditLog({
      actorId: req.user!.id,
      impersonatedById: req.user!.impersonatedBy ?? null,
      entityType: "SubPillar",
      entityId: existing.id,
      action: "Delete",
      before: { id: existing.id, pillarId: existing.pillarId, name: existing.name },
    });
    res.status(204).send();
  })
);

export default router;
