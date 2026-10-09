import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { upload } from "../middleware/upload";
import { ROLES, PROJECT_BILLING_TYPE, PROJECT_MEMBER_ROLE } from "../constants/enums";
import { writeAuditLog } from "../utils/audit";
import { assertProjectScope } from "../utils/scope";
import { paginationParams, paginated } from "../utils/pagination";
import { sumEstimatedHours } from "../utils/projectHours";
import { buildTemplateWorkbook, readFirstSheetRows } from "../services/excel";
import { validateProjectRows, normalizeBillingType, ProjectImportRow } from "../services/projectImport";

const router = Router();

function serializeProject(p: any) {
  const loggedHours = (p.tasks ?? []).reduce(
    (sum: number, t: any) => sum + (t.timesheetEntries ?? []).reduce((s: number, e: any) => s + e.hours, 0),
    0
  );
  const admins = (p.members ?? []).filter((m: any) => m.roleOnProject === PROJECT_MEMBER_ROLE.PROJECT_ADMIN);
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    clientName: p.client?.name,
    clientId: p.clientId,
    startDate: p.startDate,
    endDate: p.endDate,
    status: p.status,
    billingType: p.billingType,
    sendTimesheetToClient: p.sendTimesheetToClient ?? false,
    clientContactEmail: p.clientContactEmail ?? null,
    // Bottoms-up: budget hours are the sum of each task's estimate, never
    // entered directly on the project.
    budgetHours: sumEstimatedHours(p.tasks ?? []),
    loggedHours: Math.round(loggedHours * 100) / 100,
    admins: admins.map((m: any) => ({ userId: m.userId, name: m.user?.name })),
    tasks: (p.tasks ?? []).map((t: any) => ({
      id: t.id,
      projectId: t.projectId,
      name: t.name,
      startDate: t.startDate,
      endDate: t.endDate,
      estimatedHours: t.estimatedHours,
      billable: t.billable,
      status: t.active ? "ACTIVE" : "INACTIVE",
    })),
    members: (p.members ?? []).map((m: any) => ({
      id: m.id,
      projectId: m.projectId,
      userId: m.userId,
      userName: m.user?.name,
      roleOnProject: m.roleOnProject,
      maxHoursPerDay: m.maxHoursPerDay,
      maxHoursPerWeek: m.maxHoursPerWeek,
    })),
  };
}

const PROJECT_INCLUDE = {
  client: true,
  tasks: { include: { timesheetEntries: true } },
  members: { include: { user: true } },
} as const;

/**
 * @swagger
 * /projects:
 *   get:
 *     summary: List projects (scoped by role, paginated, searchable)
 *     tags: [Projects]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const search = req.query.search ? String(req.query.search).trim() : undefined;
    const { page, pageSize, skip, take } = paginationParams(req);

    const where: any = {
      AND: [
        clientId ? { clientId } : {},
        status ? { status } : {},
        search ? { OR: [{ name: { contains: search } }, { code: { contains: search } }] } : {},
      ],
    };

    // Super Admin/HR Admin get every project here by default — the Projects
    // management page needs that to administer the whole org. But logging
    // time is membership-gated for every role with no exception (see
    // validateEntries's NOT_ASSIGNED check), so the *timesheet* pages pass
    // `mine=true` to force this same scoping for admins too — otherwise
    // their "Add a project/task" picker offered projects that would only
    // ever get silently rejected once hours were actually typed in.
    if (req.user!.role === ROLES.PROJECT_ADMIN || req.user!.role === ROLES.INDIVIDUAL_USER || req.query.mine === "true") {
      // Any membership row counts, not just an admin one — a Project Admin
      // on one project can simultaneously be a plain team member on another
      // (or, per ProjectDetailModal's Members tab, on the same one), and
      // needs that project to show up here too so they can log time against
      // it. `canManage` (computed per-project from the project's own admins
      // list) is what actually gates edit/delete affordances, not this list.
      where.AND.push({ members: { some: { userId: req.user!.id } } });
    }

    const [total, projects] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({ where, include: PROJECT_INCLUDE, orderBy: { name: "asc" }, skip, take }),
    ]);
    res.json(paginated(projects.map(serializeProject), total, page, pageSize));
  })
);

const projectTaskInputSchema = z.object({
  name: z.string().min(1),
  billable: z.boolean().optional(),
  estimatedHours: z.coerce.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const createProjectSchema = z
  .object({
    clientId: z.coerce.number(),
    code: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    startDate: z.string(),
    endDate: z.string().nullable().optional(),
    status: z.string().optional(),
    billingType: z.enum([PROJECT_BILLING_TYPE.T_AND_M, PROJECT_BILLING_TYPE.FIXED, PROJECT_BILLING_TYPE.MANAGED_SERVICES]).optional(),
    adminIds: z.array(z.coerce.number()).optional(),
    memberIds: z.array(z.coerce.number()).optional(),
    tasks: z.array(projectTaskInputSchema).optional(),
  })
  .refine((body) => !body.endDate || new Date(body.endDate) > new Date(body.startDate), {
    message: "End date must be after start date",
    path: ["endDate"],
  });

/**
 * @swagger
 * /projects:
 *   post:
 *     summary: Create a project under a client
 *     tags: [Projects]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_ADMIN),
  asyncHandler(async (req, res) => {
    const body = createProjectSchema.parse(req.body);
    const adminIds = body.adminIds?.length ? body.adminIds : req.user!.role === ROLES.PROJECT_ADMIN ? [req.user!.id] : [];
    if (adminIds.length === 0) throw ApiError.badRequest("At least one project admin is required");

    const project = await prisma.project.create({
      data: {
        clientId: body.clientId,
        code: body.code,
        name: body.name,
        description: body.description,
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        status: body.status ?? "ACTIVE",
        billingType: body.billingType ?? PROJECT_BILLING_TYPE.T_AND_M,
      },
    });

    // SQLite's Prisma connector doesn't support createMany's skipDuplicates,
    // so add members one at a time via upsert instead. Admins are added
    // first so a userId present in both adminIds and memberIds ends up with
    // roleOnProject = "Project Admin" (the upsert below only creates
    // "Member" rows that don't already exist).
    for (const userId of adminIds) {
      await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: project.id, userId } },
        update: { roleOnProject: PROJECT_MEMBER_ROLE.PROJECT_ADMIN },
        create: { projectId: project.id, userId, roleOnProject: PROJECT_MEMBER_ROLE.PROJECT_ADMIN },
      });
    }
    if (body.memberIds?.length) {
      for (const userId of body.memberIds) {
        await prisma.projectMember.upsert({
          where: { projectId_userId: { projectId: project.id, userId } },
          update: {},
          create: { projectId: project.id, userId, roleOnProject: PROJECT_MEMBER_ROLE.MEMBER },
        });
      }
    }

    if (body.tasks?.length) {
      for (const task of body.tasks) {
        await prisma.projectTask.create({
          data: {
            projectId: project.id,
            name: task.name,
            billable: task.billable ?? true,
            estimatedHours: task.estimatedHours,
            startDate: task.startDate ? new Date(task.startDate) : undefined,
            endDate: task.endDate ? new Date(task.endDate) : undefined,
          },
        });
      }
    }

    const full = await prisma.project.findUnique({ where: { id: project.id }, include: PROJECT_INCLUDE });
    await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "Project", entityId: project.id, action: "Create", after: full });
    res.status(201).json(serializeProject(full));
  })
);

/**
 * @swagger
 * /projects/import/template:
 *   get:
 *     summary: Download the Excel bulk-upload template for projects
 *     tags: [Projects]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/import/template",
  requireAuth,
  // Matches the Users import's own scoping (HR Admin, not Project Admin) —
  // per the FS, bulk import is an HR Admin/Super Admin capability; Project
  // Admin manages projects day-to-day but was never meant to bulk-create
  // them, and this route previously left HR Admin unable to even download
  // the template despite being the role that's actually supposed to use it.
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN),
  asyncHandler(async (_req, res) => {
    const headers = [
      "Client Name",
      "Project Code",
      "Project Name",
      "Project Billing Type",
      "Sub-task Name",
      "Sub-task Billable",
      "Sub-task Estimated Hours",
      "Start Date",
      "End Date",
      "Project Admin (Employee ID)",
    ];
    const sample = {
      "Client Name": "Acme Corp",
      "Project Code": "ACM-01",
      "Project Name": "ERP Migration",
      "Project Billing Type": "T&M",
      "Sub-task Name": "Requirements",
      "Sub-task Billable": "Billable",
      "Sub-task Estimated Hours": 200,
      "Start Date": "2026-10-01",
      "End Date": "2027-03-31",
      "Project Admin (Employee ID)": "VE-2003",
    };
    const buffer = buildTemplateWorkbook(headers, sample);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="projects_import_template.xlsx"');
    res.send(buffer);
  })
);

/**
 * @swagger
 * /projects/import/dry-run:
 *   post:
 *     summary: Validate an uploaded Excel/CSV file of projects without writing anything (creates a pending ImportBatch record)
 *     tags: [Projects]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/import/dry-run",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest("No file uploaded");
    const rows = readFirstSheetRows(req.file.buffer) as unknown as ProjectImportRow[];
    if (rows.length === 0) throw ApiError.badRequest("File contains no data rows");
    const validated = await validateProjectRows(rows);
    const validRows = validated.filter((r) => r.status === "VALID").length;
    const warningRows = validated.filter((r) => r.status === "WARNING").length;
    const errorRows = validated.filter((r) => r.status === "ERROR").length;

    const batch = await prisma.importBatch.create({
      data: {
        type: "Projects",
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
 * /projects/import/commit:
 *   post:
 *     summary: Commit the rows selected from a previously dry-run project import batch
 *     tags: [Projects]
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

    for (const [idx, data] of body.rows.entries()) {
      try {
        const row = data as unknown as ProjectImportRow;
        const clientName = String(row["Client Name"]).trim();
        const admin = await prisma.user.findUnique({ where: { employeeId: String(row["Project Admin (Employee ID)"]).trim() } });
        if (!admin) throw new Error("Project admin not found");

        let client = await prisma.client.findFirst({ where: { name: clientName } });
        if (!client) client = await prisma.client.create({ data: { name: clientName } });

        const project = await prisma.project.upsert({
          where: { code: String(row["Project Code"]).trim() },
          update: {},
          create: {
            clientId: client.id,
            code: String(row["Project Code"]).trim(),
            name: String(row["Project Name"]).trim(),
            startDate: new Date(String(row["Start Date"])),
            endDate: new Date(String(row["End Date"])),
            // Excel column takes a human-readable contract type — normalize
            // to the API token before writing to the DB.
            billingType: normalizeBillingType(String(row["Project Billing Type"])),
            status: "ACTIVE",
          },
        });

        // Only sets the admin when this project row is brand new (`update:
        // {}` above leaves an existing project's membership untouched, so
        // this mirrors that create-only semantics).
        await prisma.projectMember.upsert({
          where: { projectId_userId: { projectId: project.id, userId: admin.id } },
          update: {},
          create: { projectId: project.id, userId: admin.id, roleOnProject: PROJECT_MEMBER_ROLE.PROJECT_ADMIN },
        });

        const subtaskName = String(row["Sub-task Name"] ?? "").trim();
        if (subtaskName) {
          const billableRaw = String(row["Sub-task Billable"] ?? "Billable").trim().toLowerCase();
          await prisma.projectTask.create({
            data: {
              projectId: project.id,
              name: subtaskName,
              startDate: project.startDate,
              endDate: project.endDate,
              billable: billableRaw !== "non-billable" && billableRaw !== "non billable",
              estimatedHours: row["Sub-task Estimated Hours"] ? Number(row["Sub-task Estimated Hours"]) : undefined,
            },
          });
        }

        await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "Project", entityId: project.id, action: "BulkImport", after: project });
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
 * /projects/{id}:
 *   get:
 *     summary: Get a project by id
 *     tags: [Projects]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const project = await prisma.project.findUnique({ where: { id }, include: PROJECT_INCLUDE });
    if (!project) throw ApiError.notFound("Project not found");
    res.json(serializeProject(project));
  })
);

const patchProjectSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "ON_HOLD", "ARCHIVED", "COMPLETED"]).optional(),
  billingType: z.enum([PROJECT_BILLING_TYPE.T_AND_M, PROJECT_BILLING_TYPE.FIXED, PROJECT_BILLING_TYPE.MANAGED_SERVICES]).optional(),
  sendTimesheetToClient: z.boolean().optional(),
  clientContactEmail: z.string().email().nullable().optional(),
});

/**
 * @swagger
 * /projects/{id}:
 *   patch:
 *     summary: Update a project
 *     tags: [Projects]
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  "/:id",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_ADMIN),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await assertProjectScope(req.user!, id);
    const body = patchProjectSchema.parse(req.body);
    const before = await prisma.project.findUnique({ where: { id } });
    if (!before) throw ApiError.notFound("Project not found");

    // Validated against the EFFECTIVE dates (a partial patch can touch only
    // one of the two), not just whichever field(s) this request happens to
    // include.
    const effectiveStart = body.startDate ? new Date(body.startDate) : before.startDate;
    const effectiveEnd = body.endDate === null ? null : body.endDate ? new Date(body.endDate) : before.endDate;
    if (effectiveEnd && effectiveEnd <= effectiveStart) {
      throw ApiError.badRequest("End date must be after start date");
    }

    await prisma.project.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : body.endDate === null ? null : undefined,
        status: body.status,
        billingType: body.billingType,
        sendTimesheetToClient: body.sendTimesheetToClient,
        clientContactEmail: body.clientContactEmail === null ? null : body.clientContactEmail,
      },
    });
    const project = await prisma.project.findUnique({ where: { id }, include: PROJECT_INCLUDE });
    await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "Project", entityId: id, action: "Update", before, after: project });
    res.json(serializeProject(project));
  })
);

/**
 * @swagger
 * /projects/{id}:
 *   delete:
 *     summary: Delete a project
 *     tags: [Projects]
 *     security: [{ bearerAuth: [] }]
 */
router.delete(
  "/:id",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const before = await prisma.project.findUnique({ where: { id } });
    if (!before) throw ApiError.notFound("Project not found");

    // Deletion order matters: TimesheetEntry -> Approval/ProjectTask -> ProjectMember -> Project.
    // Every ProjectTask under this project can have TimesheetEntry rows (a required, non-nullable
    // FK), and every Timesheet that has any entry against this project can have Approval rows (a
    // required FK to Timesheet). Deleting tasks/timesheets first without clearing these children
    // trips SQLite's foreign-key constraint and fails silently from the caller's point of view
    // (a 500 with no clear message) — this was the reported "delete project isn't working" bug.
    const taskIds = (await prisma.projectTask.findMany({ where: { projectId: id }, select: { id: true } })).map((t) => t.id);
    if (taskIds.length > 0) {
      const affectedTimesheetIds = (
        await prisma.timesheetEntry.findMany({ where: { projectTaskId: { in: taskIds } }, select: { timesheetId: true } })
      ).map((e) => e.timesheetId);
      await prisma.timesheetEntry.deleteMany({ where: { projectTaskId: { in: taskIds } } });
      if (affectedTimesheetIds.length > 0) {
        await prisma.approval.deleteMany({ where: { timesheetId: { in: affectedTimesheetIds } } });
      }
    }
    await prisma.projectTask.deleteMany({ where: { projectId: id } });
    await prisma.projectMember.deleteMany({ where: { projectId: id } });
    await prisma.project.delete({ where: { id } });
    await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "Project", entityId: id, action: "Delete", before });
    res.status(204).send();
  })
);

const createTaskSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  estimatedHours: z.coerce.number().optional(),
  billable: z.boolean().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

/**
 * @swagger
 * /projects/{id}/tasks:
 *   post:
 *     summary: Create a sub-task under a project
 *     tags: [Projects]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/:id/tasks",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_ADMIN),
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.id);
    await assertProjectScope(req.user!, projectId);
    const body = createTaskSchema.parse(req.body);
    const task = await prisma.projectTask.create({
      data: {
        projectId,
        name: body.name,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        estimatedHours: body.estimatedHours,
        billable: body.billable ?? true,
        active: body.status ? body.status === "ACTIVE" : true,
      },
    });
    await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "ProjectTask", entityId: task.id, action: "Create", after: task });
    res.status(201).json({
      id: task.id,
      projectId: task.projectId,
      name: task.name,
      estimatedHours: task.estimatedHours,
      billable: task.billable,
      status: task.active ? "ACTIVE" : "INACTIVE",
    });
  })
);

const addMemberSchema = z.object({
  userId: z.coerce.number(),
  roleOnProject: z.string().optional(),
  maxHoursPerDay: z.coerce.number().optional(),
  maxHoursPerWeek: z.coerce.number().optional(),
});

/**
 * @swagger
 * /projects/{id}/members:
 *   post:
 *     summary: Assign a user to a project with time-restriction settings
 *     tags: [Projects]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/:id/members",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_ADMIN),
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.id);
    await assertProjectScope(req.user!, projectId);
    const body = addMemberSchema.parse(req.body);
    const member = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: body.userId } },
      update: { roleOnProject: body.roleOnProject, maxHoursPerDay: body.maxHoursPerDay, maxHoursPerWeek: body.maxHoursPerWeek },
      create: {
        projectId,
        userId: body.userId,
        roleOnProject: body.roleOnProject ?? PROJECT_MEMBER_ROLE.MEMBER,
        maxHoursPerDay: body.maxHoursPerDay,
        maxHoursPerWeek: body.maxHoursPerWeek,
      },
      include: { user: true },
    });
    await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "ProjectMember", entityId: member.id, action: "Create", after: member });
    res.status(201).json({
      id: member.id,
      projectId: member.projectId,
      userId: member.userId,
      userName: member.user.name,
      roleOnProject: member.roleOnProject,
      maxHoursPerDay: member.maxHoursPerDay,
      maxHoursPerWeek: member.maxHoursPerWeek,
    });
  })
);

/**
 * @swagger
 * /projects/{id}/members/{userId}:
 *   delete:
 *     summary: Remove a user from a project
 *     tags: [Projects]
 *     security: [{ bearerAuth: [] }]
 */
router.delete(
  "/:id/members/:userId",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_ADMIN),
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.id);
    const userId = Number(req.params.userId);
    await assertProjectScope(req.user!, projectId);
    const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
    if (!member) throw ApiError.notFound("Member not found");
    if (member.roleOnProject === PROJECT_MEMBER_ROLE.PROJECT_ADMIN) {
      const adminCount = await prisma.projectMember.count({ where: { projectId, roleOnProject: PROJECT_MEMBER_ROLE.PROJECT_ADMIN } });
      if (adminCount <= 1) throw ApiError.badRequest("A project must have at least one admin");
    }
    await prisma.projectMember.delete({ where: { id: member.id } });
    await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "ProjectMember", entityId: member.id, action: "Delete", before: member });
    res.status(204).send();
  })
);

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function assertClientSendEnabled(projectId: number) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw ApiError.notFound("Project not found");
  if (!project.sendTimesheetToClient) {
    throw ApiError.conflict("Client timesheet sending isn't enabled for this project. Enable it on the project's settings first.");
  }
  return project;
}

const periodQuerySchema = z.object({ periodStart: z.string().min(1), periodEnd: z.string().min(1) });

/**
 * @swagger
 * /projects/{id}/client-send/preview:
 *   get:
 *     summary: List every user's logged time entries for a project within a period, for review before sending to the client
 *     tags: [Projects]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/:id/client-send/preview",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_ADMIN),
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.id);
    await assertProjectScope(req.user!, projectId);
    const project = await assertClientSendEnabled(projectId);
    const { periodStart, periodEnd } = periodQuerySchema.parse(req.query);

    const entries = await prisma.timesheetEntry.findMany({
      where: {
        projectTask: { projectId },
        entryDate: { gte: new Date(periodStart), lte: new Date(periodEnd) },
        hours: { gt: 0 },
      },
      include: { projectTask: true, timesheet: { include: { user: true } } },
      orderBy: [{ entryDate: "asc" }],
    });

    res.json({
      project: { id: project.id, name: project.name, code: project.code },
      defaultRecipientEmail: project.clientContactEmail,
      periodStart,
      periodEnd,
      totalHours: entries.reduce((s, e) => s + e.hours, 0),
      entries: entries.map((e) => ({
        entryId: e.id,
        userId: e.timesheet.userId,
        userName: e.timesheet.user.name,
        taskName: e.projectTask.name,
        entryDate: toIsoDate(e.entryDate),
        hours: e.hours,
        notes: e.notes,
      })),
    });
  })
);

const clientSendSchema = z.object({
  recipientEmail: z.string().email(),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  entryIds: z.array(z.coerce.number()).min(1, "Select at least one entry to send"),
});

/**
 * @swagger
 * /projects/{id}/client-send:
 *   post:
 *     summary: Send the selected timesheet entries to the client as a single file (placeholder delivery — see README "Swap points" for wiring a real email provider)
 *     tags: [Projects]
 *     security: [{ bearerAuth: [] }]
 */
router.post(
  "/:id/client-send",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_ADMIN),
  asyncHandler(async (req, res) => {
    const projectId = Number(req.params.id);
    await assertProjectScope(req.user!, projectId);
    const project = await assertClientSendEnabled(projectId);
    const body = clientSendSchema.parse(req.body);

    const entries = await prisma.timesheetEntry.findMany({
      where: { id: { in: body.entryIds }, projectTask: { projectId } },
      include: { projectTask: true, timesheet: { include: { user: true } } },
    });
    if (entries.length === 0) throw ApiError.badRequest("None of the selected entries belong to this project");

    const totalHours = entries.reduce((s, e) => s + e.hours, 0);
    const fileName = `${project.code}_Timesheet_${body.periodStart}_to_${body.periodEnd}.xlsx`;

    const send = await prisma.clientTimesheetSend.create({
      data: {
        projectId,
        sentById: req.user!.id,
        recipientEmail: body.recipientEmail,
        periodStart: new Date(body.periodStart),
        periodEnd: new Date(body.periodEnd),
        entryIds: entries.map((e) => e.id).join(","),
        entryCount: entries.length,
        totalHours,
        fileName,
      },
    });

    // No transactional email provider is wired up in this build (see
    // README "Swap points") — delivery is a logged placeholder, same
    // pattern as notify.ts, but the generated file and full audit record
    // (ClientTimesheetSend) are real and downloadable via
    // GET /client-sends/:id/download.
    // eslint-disable-next-line no-console
    console.log(`[client-send] "${fileName}" (${entries.length} entries, ${totalHours}h) queued for ${body.recipientEmail}`);

    await writeAuditLog({
      actorId: req.user!.id,
      impersonatedById: req.user!.impersonatedBy ?? null,
      entityType: "ClientTimesheetSend",
      entityId: send.id,
      action: "Send",
      after: send,
    });

    res.status(201).json({
      id: send.id,
      projectId: send.projectId,
      recipientEmail: send.recipientEmail,
      periodStart: toIsoDate(send.periodStart),
      periodEnd: toIsoDate(send.periodEnd),
      entryCount: send.entryCount,
      totalHours: send.totalHours,
      fileName: send.fileName,
      createdAt: send.createdAt,
      downloadUrl: `/api/v1/client-sends/${send.id}/download`,
    });
  })
);

export default router;
