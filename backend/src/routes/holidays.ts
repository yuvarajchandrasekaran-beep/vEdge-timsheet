import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES } from "../constants/enums";
import { writeAuditLog } from "../utils/audit";
import { computeUsFederalHolidays } from "../services/usFederalHolidays";

const router = Router();

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function serialize(h: { id: number; name: string; date: Date; departmentId: number | null }) {
  return { id: h.id, name: h.name, date: toIsoDate(h.date), departmentId: h.departmentId };
}

/**
 * @swagger
 * /holidays:
 *   get:
 *     summary: List holidays (company calendar), optionally filtered by year
 *     tags: [Holidays]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const year = req.query.year ? Number(req.query.year) : undefined;
    const where = year
      ? { date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } }
      : {};
    const holidays = await prisma.holiday.findMany({ where, orderBy: { date: "asc" } });
    res.json({ data: holidays.map(serialize) });
  })
);

const holidaySchema = z.object({
  name: z.string().min(1),
  date: z.string().min(1),
  departmentId: z.coerce.number().nullable().optional(),
});

/**
 * @swagger
 * /holidays:
 *   post:
 *     summary: Add a holiday to the company calendar (HR/Super Admin)
 *     tags: [Holidays]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/",
  requireAuth,
  requireRole(ROLES.HR_ADMIN, ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const body = holidaySchema.parse(req.body);
    const date = new Date(body.date);
    const existing = await prisma.holiday.findFirst({
      where: { date, name: body.name, departmentId: body.departmentId ?? null },
    });
    if (existing) throw ApiError.conflict(`"${body.name}" is already on the calendar for this date.`);
    const holiday = await prisma.holiday.create({
      data: { name: body.name, date, departmentId: body.departmentId ?? null },
    });
    await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "Holiday", entityId: holiday.id, action: "Create", after: holiday });
    res.status(201).json(serialize(holiday));
  })
);

/**
 * @swagger
 * /holidays/{id}:
 *   put:
 *     summary: Edit a holiday (HR/Super Admin)
 *     tags: [Holidays]
 *     security: [{ bearerAuth: [] }]
 */
router.put(
  "/:id",
  requireAuth,
  requireRole(ROLES.HR_ADMIN, ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const body = holidaySchema.partial().parse(req.body);
    const existing = await prisma.holiday.findUnique({ where: { id: Number(req.params.id) } });
    if (!existing) throw ApiError.notFound("Holiday not found");
    const holiday = await prisma.holiday.update({
      where: { id: existing.id },
      data: {
        name: body.name ?? undefined,
        date: body.date ? new Date(body.date) : undefined,
        departmentId: body.departmentId === undefined ? undefined : body.departmentId,
      },
    });
    await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "Holiday", entityId: holiday.id, action: "Update", before: existing, after: holiday });
    res.json(serialize(holiday));
  })
);

/**
 * @swagger
 * /holidays/{id}:
 *   delete:
 *     summary: Remove a holiday (HR/Super Admin)
 *     tags: [Holidays]
 *     security: [{ bearerAuth: [] }]
 */
router.delete(
  "/:id",
  requireAuth,
  requireRole(ROLES.HR_ADMIN, ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const existing = await prisma.holiday.findUnique({ where: { id: Number(req.params.id) } });
    if (!existing) throw ApiError.notFound("Holiday not found");
    await prisma.holiday.delete({ where: { id: existing.id } });
    await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "Holiday", entityId: existing.id, action: "Delete", before: existing });
    res.status(204).send();
  })
);

/**
 * @swagger
 * /holidays/sync-federal:
 *   post:
 *     summary: Sync the US federal holiday calendar for a given year (HR/Super Admin) — adds any missing federal holidays, leaves existing/custom entries untouched
 *     tags: [Holidays]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/sync-federal",
  requireAuth,
  requireRole(ROLES.HR_ADMIN, ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { year } = z.object({ year: z.coerce.number().int().min(2000).max(2100) }).parse(req.body ?? {});
    const computed = computeUsFederalHolidays(year);
    const created = [];
    for (const h of computed) {
      const existing = await prisma.holiday.findFirst({ where: { name: h.name, date: h.date } });
      if (existing) continue;
      const holiday = await prisma.holiday.create({ data: { name: h.name, date: h.date } });
      created.push(holiday);
    }
    await writeAuditLog({
      actorId: req.user!.id,
      impersonatedById: req.user!.impersonatedBy ?? null,
      entityType: "Holiday",
      entityId: year,
      action: "SyncFederal",
      after: { year, createdCount: created.length },
    });
    res.status(201).json({ year, created: created.map(serialize), createdCount: created.length });
  })
);

export default router;
