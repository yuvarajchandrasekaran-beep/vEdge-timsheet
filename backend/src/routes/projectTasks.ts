import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES } from "../constants/enums";
import { writeAuditLog } from "../utils/audit";
import { assertProjectScope } from "../utils/scope";

const router = Router();

const patchTaskSchema = z.object({
  name: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  estimatedHours: z.coerce.number().optional(),
  billable: z.boolean().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

/**
 * @swagger
 * /project-tasks/{id}:
 *   patch:
 *     summary: Update a sub-task (independent active date window / status)
 *     tags: [Projects]
 *     security: [{ bearerAuth: [] }]
 */
router.patch(
  "/:id",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_ADMIN),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await prisma.projectTask.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound("Task not found");
    await assertProjectScope(req.user!, existing.projectId);
    const body = patchTaskSchema.parse(req.body);
    const task = await prisma.projectTask.update({
      where: { id },
      data: {
        name: body.name,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        estimatedHours: body.estimatedHours,
        billable: body.billable,
        active: body.status ? body.status === "ACTIVE" : undefined,
      },
    });
    await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "ProjectTask", entityId: id, action: "Update", before: existing, after: task });
    res.json({
      id: task.id,
      projectId: task.projectId,
      name: task.name,
      estimatedHours: task.estimatedHours,
      billable: task.billable,
      status: task.active ? "ACTIVE" : "INACTIVE",
    });
  })
);

/**
 * @swagger
 * /project-tasks/{id}:
 *   delete:
 *     summary: Delete a sub-task (blocked if it has logged time — mark it Inactive instead)
 *     tags: [Projects]
 *     security: [{ bearerAuth: [] }]
 */
router.delete(
  "/:id",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_ADMIN),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await prisma.projectTask.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound("Task not found");
    await assertProjectScope(req.user!, existing.projectId);

    // Unlike project delete, this does NOT cascade-delete logged time —
    // a task with real hours against it should be marked Inactive instead
    // of destroying timesheet/approval history.
    const loggedEntryCount = await prisma.timesheetEntry.count({ where: { projectTaskId: id } });
    if (loggedEntryCount > 0) {
      throw ApiError.conflict("This task has logged time entries and can't be deleted. Mark it Inactive instead.");
    }

    await prisma.projectTask.delete({ where: { id } });
    await writeAuditLog({ actorId: req.user!.id, impersonatedById: req.user!.impersonatedBy ?? null, entityType: "ProjectTask", entityId: id, action: "Delete", before: existing });
    res.status(204).send();
  })
);

export default router;
