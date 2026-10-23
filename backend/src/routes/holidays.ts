import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
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

function serialize(h: { id: number; name: string; date: Date; calendarId: number }) {
  return { id: h.id, name: h.name, date: toIsoDate(h.date), calendarId: h.calendarId };
}

function serializeWithCalendar(h: { id: number; name: string; date: Date; calendarId: number; calendar: { name: string; color: string } }) {
  return {
    id: h.id,
    name: h.name,
    date: toIsoDate(h.date),
    calendarId: h.calendarId,
    calendarName: h.calendar.name,
    calendarColor: h.calendar.color,
  };
}

/**
 * @swagger
 * /holidays:
 *   get:
 *     summary: List one calendar's holidays, optionally filtered by year (HR/Super Admin management view) — see /holidays/mine for what a regular user is scoped to
 *     tags: [Holidays]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN),
  asyncHandler(async (req, res) => {
    const calendarId = req.query.calendarId ? Number(req.query.calendarId) : undefined;
    if (!calendarId) throw ApiError.badRequest("calendarId query param is required");
    const year = req.query.year ? Number(req.query.year) : undefined;
    const where: Prisma.HolidayWhereInput = { calendarId };
    if (year) where.date = { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
    const holidays = await prisma.holiday.findMany({ where, orderBy: { date: "asc" } });
    res.json({ data: holidays.map(serialize) });
  })
);

/**
 * @swagger
 * /holidays/mine:
 *   get:
 *     summary: The current user's own visible holidays for a year — every calendar belonging to a client any of their projects (active or not) is under, color-coded per calendar. This is what decorates the timesheet grids.
 *     tags: [Holidays]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const year = req.query.year ? Number(req.query.year) : undefined;
    if (!year) throw ApiError.badRequest("year query param is required");

    const memberships = await prisma.projectMember.findMany({
      where: { userId: req.user!.id },
      select: { project: { select: { client: { select: { holidayCalendarId: true } } } } },
    });
    const calendarIds = [...new Set(memberships.map((m) => m.project.client.holidayCalendarId).filter((id): id is number => id != null))];
    if (calendarIds.length === 0) return res.json({ data: [] });

    const holidays = await prisma.holiday.findMany({
      where: {
        calendarId: { in: calendarIds },
        date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
      },
      include: { calendar: { select: { name: true, color: true } } },
      orderBy: { date: "asc" },
    });
    res.json({ data: holidays.map(serializeWithCalendar) });
  })
);

const holidaySchema = z.object({
  name: z.string().min(1),
  date: z.string().min(1),
  calendarId: z.coerce.number(),
});

/**
 * @swagger
 * /holidays:
 *   post:
 *     summary: Add a holiday to a calendar (HR/Super Admin)
 *     tags: [Holidays]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/",
  requireAuth,
  requireRole(ROLES.HR_ADMIN, ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const body = holidaySchema.parse(req.body);
    const calendar = await prisma.holidayCalendar.findUnique({ where: { id: body.calendarId } });
    if (!calendar) throw ApiError.badRequest("Holiday calendar not found");
    const date = new Date(body.date);
    const existing = await prisma.holiday.findFirst({ where: { date, name: body.name, calendarId: body.calendarId } });
    if (existing) throw ApiError.conflict(`"${body.name}" is already on this calendar for this date.`);
    const holiday = await prisma.holiday.create({
      data: { name: body.name, date, calendarId: body.calendarId },
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
    if (body.calendarId) {
      const calendar = await prisma.holidayCalendar.findUnique({ where: { id: body.calendarId } });
      if (!calendar) throw ApiError.badRequest("Holiday calendar not found");
    }
    const holiday = await prisma.holiday.update({
      where: { id: existing.id },
      data: {
        name: body.name ?? undefined,
        date: body.date ? new Date(body.date) : undefined,
        calendarId: body.calendarId ?? undefined,
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
 *     summary: Sync the US federal holiday calendar for a given year into a given calendar (HR/Super Admin) — adds any missing federal holidays, leaves existing/custom entries untouched
 *     tags: [Holidays]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/sync-federal",
  requireAuth,
  requireRole(ROLES.HR_ADMIN, ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { year, calendarId } = z
      .object({ year: z.coerce.number().int().min(2000).max(2100), calendarId: z.coerce.number() })
      .parse(req.body ?? {});
    const calendar = await prisma.holidayCalendar.findUnique({ where: { id: calendarId } });
    if (!calendar) throw ApiError.badRequest("Holiday calendar not found");
    const computed = computeUsFederalHolidays(year);
    const created = [];
    for (const h of computed) {
      const existing = await prisma.holiday.findFirst({ where: { name: h.name, date: h.date, calendarId } });
      if (existing) continue;
      const holiday = await prisma.holiday.create({ data: { name: h.name, date: h.date, calendarId } });
      created.push(holiday);
    }
    await writeAuditLog({
      actorId: req.user!.id,
      impersonatedById: req.user!.impersonatedBy ?? null,
      entityType: "Holiday",
      entityId: year,
      action: "SyncFederal",
      after: { year, calendarId, createdCount: created.length },
    });
    res.status(201).json({ year, created: created.map(serialize), createdCount: created.length });
  })
);

export default router;
