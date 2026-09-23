import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth, requireRole } from "../middleware/auth";
import { ROLES } from "../constants/enums";
import { paginationParams, paginated } from "../utils/pagination";

const router = Router();

function summarizeChange(beforeState: string | null, afterState: string | null): string | undefined {
  if (!beforeState || !afterState) return undefined;
  try {
    const before = JSON.parse(beforeState);
    const after = JSON.parse(afterState);
    const changed = Object.keys(after).filter((k) => k in before && before[k] !== after[k] && typeof after[k] !== "object");
    if (changed.length === 0) return undefined;
    return changed.map((k) => `${k}: "${before[k]}" → "${after[k]}"`).join(", ");
  } catch {
    return undefined;
  }
}

/**
 * @swagger
 * /audit-logs:
 *   get:
 *     summary: Query the audit log (scoped by role)
 *     tags: [Audit]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/",
  requireAuth,
  requireRole(ROLES.SUPER_ADMIN, ROLES.HR_ADMIN, ROLES.PROJECT_ADMIN),
  asyncHandler(async (req, res) => {
    const { page, pageSize, skip, take } = paginationParams(req);
    const entityType = req.query.entityType ? String(req.query.entityType) : undefined;
    const actorId = req.query.actorId ? Number(req.query.actorId) : undefined;
    const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined;
    const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined;

    const where: any = {
      entityType,
      actorId,
      createdAt: dateFrom || dateTo ? { gte: dateFrom, lte: dateTo } : undefined,
    };

    // Project Admins only see logs about entities they administer — approximated
    // here by restricting to their own actions plus Project/Timesheet entities.
    if (req.user!.role === ROLES.PROJECT_ADMIN) {
      where.OR = [{ actorId: req.user!.id }, { entityType: { in: ["Project", "ProjectTask", "ProjectMember"] } }];
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: { actor: true, impersonatedBy: true },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);

    res.json(
      paginated(
        logs.map((l) => ({
          id: l.id,
          entityType: l.entityType,
          entityId: l.entityId,
          action: l.action,
          actorId: l.actorId,
          actorName: l.actor?.name ?? "System",
          impersonatedById: l.impersonatedById,
          impersonatedByName: l.impersonatedBy?.name ?? null,
          timestamp: l.createdAt,
          details: summarizeChange(l.beforeState, l.afterState),
        })),
        total,
        page,
        pageSize
      )
    );
  })
);

export default router;
