import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/errors";
import { requireAuth, signToken, AuthUser } from "../middleware/auth";
import { RoleName } from "../constants/enums";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function toAuthUser(u: { id: number; employeeId: string; name: string; email: string; departmentId: number | null; role: { name: string } }): AuthUser {
  return {
    id: u.id,
    employeeId: u.employeeId,
    name: u.name,
    email: u.email,
    role: u.role.name as RoleName,
    departmentId: u.departmentId,
  };
}

function serializeUser(u: any) {
  return {
    id: u.id,
    employeeId: u.employeeId,
    name: u.name,
    email: u.email,
    role: u.role.name,
    department: u.department?.name ?? null,
    jobTitle: u.jobTitle,
    managerId: u.managerId,
    managerName: u.manager?.name ?? null,
    status: u.status,
    startDate: u.startDate,
    timezone: u.timezone,
    location: u.location,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Authenticate and receive a JWT access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *     responses:
 *       200: { description: OK }
 *       401: { description: Invalid credentials }
 */
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { role: true, department: true, manager: true },
    });
    if (!user || user.status !== "ACTIVE") throw ApiError.unauthorized("Invalid email or password");
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw ApiError.unauthorized("Invalid email or password");

    const accessToken = signToken(toAuthUser(user));
    res.json({ accessToken, user: serializeUser(user) });
  })
);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get the current authenticated user's profile
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { role: true, department: true, manager: true },
    });
    if (!user) throw ApiError.notFound("User not found");
    res.json(serializeUser(user));
  })
);

export default router;
