import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { ROLES, TIMESHEET_STATUS, PROJECT_MEMBER_ROLE } from "../constants/enums";
import { resolveApprover } from "../services/approvalRouting";

const router = Router();

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Uses UTC calendar fields throughout so the result lines up with date-only
// values (e.g. "2026-08-31") stored via `new Date(isoDateString)`, which JS
// always parses as UTC midnight regardless of the server's local timezone.
function mondayOf(date: Date): Date {
  const utcMidnight = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const diffFromMonday = (utcMidnight.getUTCDay() + 6) % 7;
  utcMidnight.setUTCDate(utcMidnight.getUTCDate() - diffFromMonday);
  return utcMidnight;
}

/**
 * @swagger
 * /dashboard/summary:
 *   get:
 *     summary: Aggregated stats for the role-aware home dashboard (not in the original spec's endpoint table — added for the UI's stat cards/charts)
 *     tags: [Dashboard]
 *     security: [{ bearerAuth: [] }]
 */
router.get(
  "/summary",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const weekStart = mondayOf(new Date());

    const myTimesheet = await prisma.timesheet.findUnique({
      where: { userId_weekStartDate: { userId: user.id, weekStartDate: weekStart } },
      include: { entries: true },
    });
    const totalLogged = myTimesheet?.entries.reduce((s, e) => s + e.hours, 0) ?? 0;
    const standardWeekHours = 40;

    let approvalsPending = 0;
    if (user.role === ROLES.PROJECT_ADMIN || user.role === ROLES.SUPER_ADMIN) {
      const submitted = await prisma.timesheet.findMany({ where: { status: TIMESHEET_STATUS.SUBMITTED } });
      for (const t of submitted) {
        const { approverIds } = await resolveApprover(t.id);
        if (user.role === ROLES.SUPER_ADMIN || approverIds.includes(user.id)) approvalsPending++;
      }
    }

    const projectsActiveWhere =
      user.role === ROLES.INDIVIDUAL_USER
        ? { members: { some: { userId: user.id } }, status: "ACTIVE" }
        : user.role === ROLES.PROJECT_ADMIN
        ? { members: { some: { userId: user.id, roleOnProject: PROJECT_MEMBER_ROLE.PROJECT_ADMIN } }, status: "ACTIVE" }
        : { status: "ACTIVE" };
    const projectsActive = await prisma.project.count({ where: projectsActiveWhere });
    const clientsCount = await prisma.client.count();

    const unreadNotifications = await prisma.notification.count({ where: { userId: user.id, readAt: null } });

    const topProjects = myTimesheet
      ? Object.values(
          (
            await prisma.timesheetEntry.findMany({
              where: { timesheetId: myTimesheet.id },
              include: { projectTask: { include: { project: true } } },
            })
          ).reduce((acc: Record<string, { project: string; hours: number }>, e) => {
            const key = e.projectTask.project.name;
            acc[key] = acc[key] || { project: key, hours: 0 };
            acc[key].hours += e.hours;
            return acc;
          }, {})
        ).sort((a, b) => b.hours - a.hours)
      : [];

    const holidays = await prisma.holiday.findMany({ where: { date: { gte: new Date() } }, orderBy: { date: "asc" }, take: 1 });

    res.json({
      greetingName: user.name,
      weekStartDate: toIsoDate(weekStart),
      myTimesheet: {
        totalLogged,
        remaining: Math.max(0, standardWeekHours - totalLogged),
        status: myTimesheet?.status ?? TIMESHEET_STATUS.DRAFT,
        timesheetId: myTimesheet ? `TS-${new Date().getFullYear()}-${String(myTimesheet.id).padStart(2, "0")}` : null,
      },
      approvalsPending,
      projectsActive,
      clientsCount,
      unreadNotifications,
      topProjects,
      announcement:
        holidays.length > 0
          ? { message: `Holiday on ${toIsoDate(holidays[0].date)}: ${holidays[0].name}. Timesheets for this week are due by end of day Sunday.` }
          : null,
    });
  })
);

export default router;
