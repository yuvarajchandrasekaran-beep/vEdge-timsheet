import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth";

const router = Router();

/**
 * @swagger
 * /departments:
 *   get:
 *     summary: List departments
 *     tags: [Lookups]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/departments",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const departments = await prisma.department.findMany({ orderBy: { name: "asc" } });
    res.json(departments);
  })
);

/**
 * @swagger
 * /roles:
 *   get:
 *     summary: List roles
 *     tags: [Lookups]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/roles",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const roles = await prisma.role.findMany();
    res.json(roles);
  })
);

export default router;
