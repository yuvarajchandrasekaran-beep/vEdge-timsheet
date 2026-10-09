import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { paginationParams, paginated } from "../utils/pagination";
import { writeAuditLog } from "../utils/audit";
import { ROLES } from "../constants/enums";
import { buildTemplateWorkbook, readFirstSheetRows } from "../services/excel";
import { validateUserRows, UserImportRow } from "../services/userImport";
import { ensureDefaultProject, enrollInDefaultProject } from "../services/defaultProject";

const router = Router();
const DEFAULT_PASSWORD = "Password123!";

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

async function findOrCreateDepartment(name: string) {
  let dept = await prisma.department.findFirst({ where: { OR: [{ name }, { code: name }] } });
  if (!dept) dept = await prisma.department.create({ data: { name, code: name.slice(0, 10).toUpperCase() } });
  return dept;
}

/**
 * @swagger
 * /users:
 *   get:
 *     summary: List users (paginated, filterable)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN, ROLES.PROJECT_ADMIN),
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = paginationParams(req);
    const search = String(req.query.search ?? "").trim();
    const roleFilter = req.query.role ? String(req.query.role) : undefined;
    const departmentFilter = req.query.department ? String(req.query.department) : undefined;
    const statusFilter = req.query.status ? String(req.query.status) : undefined;

    const where: any = {
      AND: [
        search
          ? { OR: [{ name: { contains: search } }, { email: { contains: search } }, { employeeId: { contains: search } }] }
          : {},
        roleFilter ? { role: { name: roleFilter } } : {},
        departmentFilter ? { department: { name: departmentFilter } } : {},
        statusFilter ? { status: statusFilter } : {},
      ],
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        include: { role: true, department: true, manager: true },
        orderBy: { name: "asc" },
        skip,
        take,
      }),
    ]);

    res.json(paginated(users.map(serializeUser), total, page, pageSize));
  })
);

const createUserSchema = z.object({
  employeeId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["SUPER_ADMIN", "HR_ADMIN", "PROJECT_ADMIN", "INDIVIDUAL_USER"]),
  department: z.string().min(1),
  jobTitle: z.string().optional(),
  managerId: z.coerce.number().nullable().optional(),
  startDate: z.string().optional(),
  timezone: z.string().optional(),
  location: z.string().optional(),
});

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create a single user
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN),
  asyncHandler(async (req, res) => {
    const body = createUserSchema.parse(req.body);
    const role = await prisma.role.findUnique({ where: { name: body.role } });
    if (!role) throw ApiError.badRequest("Invalid role");
    const dept = await findOrCreateDepartment(body.department);

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    const user = await prisma.user.create({
      data: {
        employeeId: body.employeeId,
        name: body.name,
        email: body.email.toLowerCase(),
        passwordHash,
        roleId: role.id,
        departmentId: dept.id,
        jobTitle: body.jobTitle,
        managerId: body.managerId ?? undefined,
        startDate: body.startDate ? new Date(body.startDate) : new Date(),
        timezone: body.timezone,
        location: body.location,
      },
      include: { role: true, department: true, manager: true },
    });
    const { id: defaultProjectId } = await ensureDefaultProject();
    await enrollInDefaultProject(user.id, defaultProjectId);

    await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "User", entityId: user.id, action: "Create", after: serializeUser(user) });
    res.status(201).json(serializeUser(user));
  })
);

/**
 * @swagger
 * /users/import/template:
 *   get:
 *     summary: Download the Excel bulk-upload template for users
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/import/template",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN),
  asyncHandler(async (_req, res) => {
    const headers = [
      "Employee ID",
      "Full Name",
      "Work Email",
      "Department",
      "Role",
      "Reporting Manager (Employee ID)",
      "Start Date",
      "Status",
    ];
    const sample = {
      "Employee ID": "VE-3001",
      "Full Name": "Jane Doe",
      "Work Email": "jane.doe@vivid-edge.com",
      Department: "Engineering",
      Role: "INDIVIDUAL_USER",
      "Reporting Manager (Employee ID)": "VE-2003",
      "Start Date": "2026-09-15",
      Status: "Active",
    };
    const buffer = buildTemplateWorkbook(headers, sample);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="users_import_template.xlsx"');
    res.send(buffer);
  })
);

/**
 * @swagger
 * /users/import/dry-run:
 *   post:
 *     summary: Validate an uploaded Excel/CSV file of users without writing anything (creates a pending ImportBatch record)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/import/dry-run",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest("No file uploaded");
    const rows = readFirstSheetRows(req.file.buffer) as unknown as UserImportRow[];
    if (rows.length === 0) throw ApiError.badRequest("File contains no data rows");
    const validated = await validateUserRows(rows);
    const validRows = validated.filter((r) => r.status === "VALID").length;
    const warningRows = validated.filter((r) => r.status === "WARNING").length;
    const errorRows = validated.filter((r) => r.status === "ERROR").length;

    const batch = await prisma.importBatch.create({
      data: {
        type: "Users",
        uploadedById: req.user!.id,
        fileName: req.file.originalname,
        totalRows: validated.length,
        successRows: 0,
        errorRows,
        errorReport: JSON.stringify(validated),
      },
    });

    res.json({
      batchId: batch.id,
      fileName: req.file.originalname,
      totalRows: validated.length,
      validRows,
      warningRows,
      errorRows,
      rows: validated,
    });
  })
);

const commitSchema = z.object({
  batchId: z.coerce.number(),
  rows: z.array(z.record(z.string(), z.any())),
});

/**
 * @swagger
 * /users/import/commit:
 *   post:
 *     summary: Commit the rows selected from a previously dry-run import batch
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/import/commit",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN),
  asyncHandler(async (req, res) => {
    const body = commitSchema.parse(req.body);
    let successRows = 0;
    const errors: { row: number; errors: string[] }[] = [];
    const { id: defaultProjectId } = await ensureDefaultProject();

    for (const [idx, data] of body.rows.entries()) {
      try {
        const row = data as unknown as UserImportRow;
        const employeeId = String(row["Employee ID"]).trim();
        const email = String(row["Work Email"]).trim().toLowerCase();
        const roleName = String(row["Role"]).trim().toUpperCase().replace(/\s+/g, "_");
        const deptName = String(row["Department"]).trim();
        // The Excel column takes human-readable "Active"/"Inactive" (per spec 4.1.2);
        // normalize to the ACTIVE/INACTIVE API token before writing to the DB.
        const statusValue = String(row["Status"] ?? "").trim().toLowerCase() === "inactive" ? "INACTIVE" : "ACTIVE";

        const role = await prisma.role.findUnique({ where: { name: roleName } });
        if (!role) throw new Error(`Unknown role ${roleName}`);
        const dept = await findOrCreateDepartment(deptName);

        let manager = null;
        const managerEmployeeId = String(row["Reporting Manager (Employee ID)"] ?? "").trim();
        if (managerEmployeeId) {
          manager = await prisma.user.findUnique({ where: { employeeId: managerEmployeeId } });
        }

        const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
        const user = await prisma.user.upsert({
          where: { employeeId },
          update: {
            name: String(row["Full Name"]),
            email,
            roleId: role.id,
            departmentId: dept.id,
            managerId: manager?.id,
            status: statusValue,
          },
          create: {
            employeeId,
            name: String(row["Full Name"]),
            email,
            passwordHash,
            roleId: role.id,
            departmentId: dept.id,
            managerId: manager?.id,
            startDate: new Date(String(row["Start Date"])),
            status: statusValue,
          },
        });
        await enrollInDefaultProject(user.id, defaultProjectId);
        await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "User", entityId: user.id, action: "BulkImport", after: user });
        successRows += 1;
      } catch (e: any) {
        errors.push({ row: idx + 1, errors: [e.message ?? "Unknown error"] });
      }
    }

    const batch = await prisma.importBatch.update({
      where: { id: body.batchId },
      data: { successRows, errorReport: JSON.stringify(errors) },
    });

    res.status(201).json({ batchId: batch.id, successRows, errorRows: errors.length, totalRows: body.rows.length });
  })
);

/**
 * @swagger
 * /users/{id}/history:
 *   get:
 *     summary: Field-level change history for a user, derived from the audit log
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/:id/history",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const logs = await prisma.auditLog.findMany({
      where: { entityType: "User", entityId: id, action: "Update" },
      include: { actor: true },
      orderBy: { createdAt: "asc" },
    });

    const TRACKED_FIELDS = ["name", "status", "jobTitle", "roleId", "departmentId", "managerId"] as const;
    const FIELD_LABELS: Record<(typeof TRACKED_FIELDS)[number], string> = {
      name: "Name",
      status: "Status",
      jobTitle: "Job title",
      roleId: "Role",
      departmentId: "Department",
      managerId: "Reporting manager",
    };

    // roleId/departmentId/managerId are foreign keys — showing the raw
    // number ("1 to 4") is meaningless to a reader. Resolve each to its
    // real name before returning, same as the rest of the UI would show it.
    const [roles, departments, users] = await Promise.all([
      prisma.role.findMany(),
      prisma.department.findMany(),
      prisma.user.findMany({ select: { id: true, name: true } }),
    ]);
    const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
    const departmentNameById = new Map(departments.map((d) => [d.id, d.name]));
    const userNameById = new Map(users.map((u) => [u.id, u.name]));
    const RESOLVERS: Partial<Record<(typeof TRACKED_FIELDS)[number], Map<number, string>>> = {
      roleId: roleNameById,
      departmentId: departmentNameById,
      managerId: userNameById,
    };

    function resolve(field: (typeof TRACKED_FIELDS)[number], value: unknown): string {
      if (value === null || value === undefined) return "—";
      const resolver = RESOLVERS[field];
      if (resolver) {
        const resolved = resolver.get(Number(value));
        if (resolved) return resolved;
      }
      return String(value);
    }

    const entries: { id: string; field: string; oldValue: string; newValue: string; changedBy: string; changedAt: string }[] = [];

    for (const log of logs) {
      if (!log.beforeState || !log.afterState) continue;
      const before = JSON.parse(log.beforeState);
      const after = JSON.parse(log.afterState);
      for (const field of TRACKED_FIELDS) {
        if (before[field] !== after[field] && before[field] !== undefined) {
          entries.push({
            id: `${log.id}-${field}`,
            field: FIELD_LABELS[field],
            oldValue: resolve(field, before[field]),
            newValue: resolve(field, after[field]),
            changedBy: log.actor?.name ?? "System",
            changedAt: log.createdAt.toISOString(),
          });
        }
      }
    }

    res.json(entries);
  })
);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get a user by id
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (req.user!.role === ROLES.INDIVIDUAL_USER && req.user!.id !== id) {
      throw ApiError.forbidden();
    }
    const user = await prisma.user.findUnique({ where: { id }, include: { role: true, department: true, manager: true } });
    if (!user) throw ApiError.notFound("User not found");
    res.json(serializeUser(user));
  })
);

const patchUserSchema = z.object({
  name: z.string().optional(),
  role: z.enum(["SUPER_ADMIN", "HR_ADMIN", "PROJECT_ADMIN", "INDIVIDUAL_USER"]).optional(),
  department: z.string().optional(),
  jobTitle: z.string().nullable().optional(),
  managerId: z.coerce.number().nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  location: z.string().nullable().optional(),
  timezone: z.string().optional(),
});

/**
 * @swagger
 * /users/{id}:
 *   patch:
 *     summary: Update or deactivate a user
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  "/:id",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const body = patchUserSchema.parse(req.body);
    const before = await prisma.user.findUnique({ where: { id } });
    if (!before) throw ApiError.notFound("User not found");

    // A Super/HR Admin deactivating their own account would lock themselves
    // out with no way back in short of another admin reactivating them (this
    // happened on the demo deployment) — block it outright.
    if (id === req.user!.id && body.status === "INACTIVE") {
      throw ApiError.badRequest("You can't deactivate your own account");
    }

    let roleId: number | undefined;
    if (body.role) {
      const role = await prisma.role.findUnique({ where: { name: body.role } });
      if (!role) throw ApiError.badRequest("Invalid role");
      roleId = role.id;
    }

    let departmentId: number | undefined;
    if (body.department) {
      departmentId = (await findOrCreateDepartment(body.department)).id;
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        name: body.name,
        roleId,
        departmentId,
        jobTitle: body.jobTitle,
        managerId: body.managerId,
        status: body.status,
        location: body.location,
        timezone: body.timezone,
      },
      include: { role: true, department: true, manager: true },
    });

    await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "User", entityId: id, action: "Update", before, after: user });
    res.json(serializeUser(user));
  })
);

export default router;
