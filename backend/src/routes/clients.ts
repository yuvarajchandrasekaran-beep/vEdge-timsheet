import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES } from "../constants/enums";
import { writeAuditLog } from "../utils/audit";

const router = Router();

function serialize(c: {
  id: number;
  name: string;
  status: string;
  _count: { projects: number };
  holidayCalendarId: number | null;
  holidayCalendar: { name: string; color: string } | null;
}) {
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    projectCount: c._count.projects,
    holidayCalendarId: c.holidayCalendarId,
    holidayCalendarName: c.holidayCalendar?.name ?? null,
    holidayCalendarColor: c.holidayCalendar?.color ?? null,
  };
}

/**
 * @swagger
 * /clients:
 *   get:
 *     summary: List clients
 *     tags: [Clients]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN, ROLES.PROJECT_ADMIN),
  asyncHandler(async (_req, res) => {
    const clients = await prisma.client.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { projects: true } }, holidayCalendar: { select: { name: true, color: true } } },
    });
    res.json({ data: clients.map(serialize) });
  })
);

const createClientSchema = z.object({ name: z.string().min(1), status: z.enum(["ACTIVE", "INACTIVE"]).optional() });

/**
 * @swagger
 * /clients:
 *   post:
 *     summary: Create a client
 *     tags: [Clients]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_ADMIN),
  asyncHandler(async (req, res) => {
    const body = createClientSchema.parse(req.body);
    const client = await prisma.client.create({ data: { name: body.name, status: body.status ?? "ACTIVE" } });
    await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "Client", entityId: client.id, action: "Create", after: client });
    res.status(201).json(serialize({ ...client, _count: { projects: 0 }, holidayCalendar: null }));
  })
);

const updateClientSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  holidayCalendarId: z.coerce.number().nullable().optional(),
});

/**
 * @swagger
 * /clients/{id}:
 *   put:
 *     summary: Update a client's status or holiday calendar (HR/Super Admin)
 *     tags: [Clients]
 *     security: [{ bearerAuth: [] }]
 */
router.put(
  "/:id",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await prisma.client.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound("Client not found");
    const body = updateClientSchema.parse(req.body);
    if (body.holidayCalendarId) {
      const calendar = await prisma.holidayCalendar.findUnique({ where: { id: body.holidayCalendarId } });
      if (!calendar) throw ApiError.badRequest("Holiday calendar not found");
    }
    const client = await prisma.client.update({
      where: { id },
      data: {
        status: body.status ?? undefined,
        holidayCalendarId: body.holidayCalendarId === undefined ? undefined : body.holidayCalendarId,
      },
      include: { _count: { select: { projects: true } }, holidayCalendar: { select: { name: true, color: true } } },
    });
    await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "Client", entityId: client.id, action: "Update", before: existing, after: client });
    res.json(serialize(client));
  })
);

export default router;
