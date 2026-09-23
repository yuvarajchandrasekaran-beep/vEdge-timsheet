import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES } from "../constants/enums";
import { writeAuditLog } from "../utils/audit";

const router = Router();

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
    const clients = await prisma.client.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { projects: true } } } });
    res.json({ data: clients });
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
    res.status(201).json(client);
  })
);

export default router;
