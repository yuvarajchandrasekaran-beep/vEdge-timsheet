import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES } from "../constants/enums";
import { writeAuditLog } from "../utils/audit";

const router = Router();

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function serialize(c: {
  id: number;
  name: string;
  color: string;
  clients?: { id: number; name: string }[];
  _count?: { holidays: number };
}) {
  return {
    id: c.id,
    name: c.name,
    color: c.color,
    clientIds: c.clients?.map((cl) => cl.id),
    clientNames: c.clients?.map((cl) => cl.name),
    holidayCount: c._count?.holidays ?? 0,
  };
}

/**
 * @swagger
 * /holiday-calendars:
 *   get:
 *     summary: List all holiday calendars (HR/Super Admin management view — see /holidays/mine for what a regular user is scoped to)
 *     tags: [Holidays]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN),
  asyncHandler(async (_req, res) => {
    const calendars = await prisma.holidayCalendar.findMany({
      orderBy: { name: "asc" },
      include: { clients: { select: { id: true, name: true } }, _count: { select: { holidays: true } } },
    });
    res.json({ data: calendars.map(serialize) });
  })
);

const calendarSchema = z.object({
  name: z.string().min(1),
  color: z.string().regex(HEX_COLOR, "Color must be a hex code like #1B4298"),
});

/**
 * @swagger
 * /holiday-calendars:
 *   post:
 *     summary: Create a holiday calendar (HR/Super Admin)
 *     tags: [Holidays]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN),
  asyncHandler(async (req, res) => {
    const body = calendarSchema.parse(req.body);
    const existing = await prisma.holidayCalendar.findUnique({ where: { name: body.name } });
    if (existing) throw ApiError.conflict(`A calendar named "${body.name}" already exists.`);
    const calendar = await prisma.holidayCalendar.create({ data: body });
    await writeAuditLog({
      actorId: req.user!.id,
      impersonatedById: req.user!.impersonatedBy ?? null,
      entityType: "HolidayCalendar",
      entityId: calendar.id,
      action: "Create",
      after: calendar,
    });
    res.status(201).json(serialize(calendar));
  })
);

/**
 * @swagger
 * /holiday-calendars/{id}:
 *   put:
 *     summary: Rename or recolor a holiday calendar (HR/Super Admin)
 *     tags: [Holidays]
 *     security: [{ bearerAuth: [] }]
 */
router.put(
  "/:id",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN),
  asyncHandler(async (req, res) => {
    const existing = await prisma.holidayCalendar.findUnique({ where: { id: Number(req.params.id) } });
    if (!existing) throw ApiError.notFound("Holiday calendar not found");
    const body = calendarSchema.partial().parse(req.body);
    if (body.name && body.name !== existing.name) {
      const nameTaken = await prisma.holidayCalendar.findUnique({ where: { name: body.name } });
      if (nameTaken) throw ApiError.conflict(`A calendar named "${body.name}" already exists.`);
    }
    const calendar = await prisma.holidayCalendar.update({ where: { id: existing.id }, data: body });
    await writeAuditLog({
      actorId: req.user!.id,
      impersonatedById: req.user!.impersonatedBy ?? null,
      entityType: "HolidayCalendar",
      entityId: calendar.id,
      action: "Update",
      before: existing,
      after: calendar,
    });
    res.json(serialize(calendar));
  })
);

/**
 * @swagger
 * /holiday-calendars/{id}:
 *   delete:
 *     summary: Delete a holiday calendar (HR/Super Admin) — blocked while it still has holidays or assigned clients, so deleting never silently orphans either
 *     tags: [Holidays]
 *     security: [{ bearerAuth: [] }]
 */
router.delete(
  "/:id",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN),
  asyncHandler(async (req, res) => {
    const existing = await prisma.holidayCalendar.findUnique({
      where: { id: Number(req.params.id) },
      include: { _count: { select: { clients: true, holidays: true } } },
    });
    if (!existing) throw ApiError.notFound("Holiday calendar not found");
    if (existing._count.clients > 0) {
      throw ApiError.conflict(`"${existing.name}" is still assigned to ${existing._count.clients} client(s) — reassign them first.`);
    }
    if (existing._count.holidays > 0) {
      throw ApiError.conflict(`"${existing.name}" still has ${existing._count.holidays} holiday(s) — remove them first.`);
    }
    await prisma.holidayCalendar.delete({ where: { id: existing.id } });
    await writeAuditLog({
      actorId: req.user!.id,
      impersonatedById: req.user!.impersonatedBy ?? null,
      entityType: "HolidayCalendar",
      entityId: existing.id,
      action: "Delete",
      before: existing,
    });
    res.status(204).send();
  })
);

export default router;
