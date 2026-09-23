import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/errors";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES } from "../constants/enums";
import { assertProjectScope } from "../utils/scope";
import { buildWorkbookFromRows } from "../services/excel";

const router = Router();

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * @swagger
 * /client-sends:
 *   get:
 *     summary: History of client timesheet sends, optionally filtered by project
 *     tags: [Projects]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_ADMIN),
  asyncHandler(async (req, res) => {
    const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;
    if (projectId) await assertProjectScope(req.user!, projectId);

    const where =
      req.user!.role === ROLES.SUPER_ADMIN
        ? projectId
          ? { projectId }
          : {}
        : { projectId: projectId ?? { in: (await prisma.projectMember.findMany({ where: { userId: req.user!.id, roleOnProject: "Project Admin" }, select: { projectId: true } })).map((m) => m.projectId) } };

    const sends = await prisma.clientTimesheetSend.findMany({
      where,
      include: { project: true, sentBy: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      data: sends.map((s) => ({
        id: s.id,
        projectId: s.projectId,
        projectName: s.project.name,
        sentByName: s.sentBy.name,
        recipientEmail: s.recipientEmail,
        periodStart: toIsoDate(s.periodStart),
        periodEnd: toIsoDate(s.periodEnd),
        entryCount: s.entryCount,
        totalHours: s.totalHours,
        fileName: s.fileName,
        createdAt: s.createdAt,
      })),
    });
  })
);

/**
 * @swagger
 * /client-sends/{id}/download:
 *   get:
 *     summary: Download the file generated for a past client send, regenerated from its recorded entries
 *     tags: [Projects]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/:id/download",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.PROJECT_ADMIN),
  asyncHandler(async (req, res) => {
    const send = await prisma.clientTimesheetSend.findUnique({ where: { id: Number(req.params.id) } });
    if (!send) throw ApiError.notFound("Send record not found");
    await assertProjectScope(req.user!, send.projectId);

    const entryIds = send.entryIds.split(",").filter(Boolean).map(Number);
    const entries = await prisma.timesheetEntry.findMany({
      where: { id: { in: entryIds } },
      include: { projectTask: { include: { project: true } }, timesheet: { include: { user: true } } },
      orderBy: [{ entryDate: "asc" }],
    });

    const rows = entries.map((e) => ({
      Employee: e.timesheet.user.name,
      Project: e.projectTask.project.name,
      Task: e.projectTask.name,
      Date: toIsoDate(e.entryDate),
      Hours: e.hours,
      Notes: e.notes ?? "",
    }));
    const buffer = buildWorkbookFromRows(rows, "Timesheet");

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${send.fileName}"`);
    res.send(buffer);
  })
);

export default router;
