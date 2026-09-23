import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/errors";
import { requireAuth, requireRole, signToken, AuthUser } from "../middleware/auth";
import { ROLES, RoleName } from "../constants/enums";
import { writeAuditLog } from "../utils/audit";

const router = Router();

const USER_INCLUDE = { role: true, department: true, manager: true } as const;
type UserWithRelations = NonNullable<Awaited<ReturnType<typeof findUserWithRelations>>>;
function findUserWithRelations(where: { id: number } | { email: string }) {
  return prisma.user.findUnique({ where: where as any, include: USER_INCLUDE });
}

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

function serializeUser(u: UserWithRelations, impersonation: { by: { id: number; name: string; email: string } } | null = null) {
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
    impersonation,
  };
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

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
    const user = await findUserWithRelations({ email: email.toLowerCase() });
    if (!user || user.status !== "ACTIVE") throw ApiError.unauthorized("Invalid email or password");
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw ApiError.unauthorized("Invalid email or password");

    const accessToken = signToken(toAuthUser(user));
    res.json({ accessToken, user: serializeUser(user) });
  })
);

const googleSchema = z.object({
  credential: z.string().min(1),
});

/**
 * @swagger
 * /auth/google:
 *   post:
 *     summary: Authenticate via a Google Identity Services ID token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *     responses:
 *       200: { description: OK }
 *       401: { description: No matching active account for this Google identity }
 *       503: { description: Google sign-in is not configured on this server }
 */
router.post(
  "/google",
  asyncHandler(async (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new ApiError(503, "Google sign-in is not configured on this server");

    const { credential } = googleSchema.parse(req.body);
    const client = new OAuth2Client(clientId);

    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
      payload = ticket.getPayload();
    } catch {
      throw ApiError.unauthorized("Invalid Google credential");
    }
    if (!payload?.email || !payload.email_verified) {
      throw ApiError.unauthorized("Google account has no verified email");
    }

    // Google sign-in only links to an EXISTING TimeSync account by email —
    // it never creates one. There's no self-service signup in this app;
    // accounts are provisioned by HR/Super Admin (see routes/users.ts).
    const user = await findUserWithRelations({ email: payload.email.toLowerCase() });
    if (!user || user.status !== "ACTIVE") {
      throw ApiError.unauthorized("No active TimeSync account found for this Google account");
    }

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
    const user = await findUserWithRelations({ id: req.user!.id });
    if (!user) throw ApiError.notFound("User not found");

    let impersonation: { by: { id: number; name: string; email: string } } | null = null;
    if (req.user!.impersonatedBy) {
      const admin = await prisma.user.findUnique({ where: { id: req.user!.impersonatedBy } });
      if (admin) impersonation = { by: { id: admin.id, name: admin.name, email: admin.email } };
    }

    res.json(serializeUser(user, impersonation));
  })
);

/**
 * @swagger
 * /auth/impersonate/stop:
 *   post:
 *     summary: End the current impersonation session and return a fresh token for the real (admin) account
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 */
// Registered BEFORE the /impersonate/:userId route below — Express matches
// routes in registration order, and :userId would otherwise greedily match
// the literal "stop" (as a param, not a route name), running this request
// through requireRole(SUPER_ADMIN) instead and failing for any impersonated
// non-admin trying to return to their own account.
router.post(
  "/impersonate/stop",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user!.impersonatedBy) throw ApiError.badRequest("Not currently impersonating anyone");

    await writeAuditLog({
      actorId: req.user!.id,
      impersonatedById: req.user!.impersonatedBy ?? null,
      entityType: "Impersonation",
      entityId: req.user!.id,
      action: "End",
    });

    const admin = await findUserWithRelations({ id: req.user!.impersonatedBy });
    if (!admin) throw ApiError.notFound("Original account no longer exists");

    const accessToken = signToken(toAuthUser(admin));
    res.json({ accessToken, user: serializeUser(admin) });
  })
);

/**
 * @swagger
 * /auth/impersonate/{userId}:
 *   post:
 *     summary: (Super Admin) Start impersonating another user — e.g. to cover their queue while they're away. Fully assumes the target's own role/permissions; logged to the audit trail.
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/impersonate/:userId",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    if (req.user!.impersonatedBy) {
      throw ApiError.badRequest("Already impersonating someone — return to your own account first");
    }
    const targetId = Number(req.params.userId);
    if (targetId === req.user!.id) throw ApiError.badRequest("You are already signed in as yourself");

    const target = await findUserWithRelations({ id: targetId });
    if (!target) throw ApiError.notFound("User not found");
    if (target.status !== "ACTIVE") throw ApiError.badRequest("Cannot impersonate an inactive user");

    const accessToken = signToken(toAuthUser(target), { impersonatedBy: req.user!.id });
    await writeAuditLog({
      actorId: req.user!.id,
      impersonatedById: req.user!.impersonatedBy ?? null,
      entityType: "Impersonation",
      entityId: target.id,
      action: "Start",
      after: { targetEmail: target.email, targetName: target.name },
    });

    res.json({
      accessToken,
      user: serializeUser(target, { by: { id: req.user!.id, name: req.user!.name, email: req.user!.email } }),
    });
  })
);

export default router;
