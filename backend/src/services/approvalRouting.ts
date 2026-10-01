import { prisma } from "../lib/prisma";
import { PROJECT_MEMBER_ROLE } from "../constants/enums";

/**
 * Single-level approval: every timesheet is reviewed and approved by a
 * Project Admin of the project(s) it logs time against — there is no
 * second (HR Admin / org-wide) level anymore.
 *
 * A project can have several admins (ProjectMember rows with
 * roleOnProject = "Project Admin"), so this resolves to a *set* of eligible
 * approvers rather than a single user: whichever project contributed the
 * most entries to the timesheet (if a week spans several projects), any one
 * of that project's admins may act.
 *
 * Self-approval: if the submitter is themselves one of the resolved admins
 * (i.e. a Project Admin submitting their own logged time on a project they
 * administer), the timesheet is approved immediately at submit time — see
 * routes/timesheets.ts's submit handler.
 */
export async function resolveApprover(timesheetId: number): Promise<{ approverIds: number[]; selfAdministered: boolean }> {
  const entries = await prisma.timesheetEntry.findMany({
    where: { timesheetId },
    include: {
      projectTask: {
        include: { project: { include: { members: { where: { roleOnProject: PROJECT_MEMBER_ROLE.PROJECT_ADMIN } } } } },
      },
    },
  });
  const timesheet = await prisma.timesheet.findUnique({ where: { id: timesheetId } });
  if (!timesheet || entries.length === 0) return { approverIds: [], selfAdministered: false };

  const entryCountByProject = new Map<number, number>();
  const adminIdsByProject = new Map<number, number[]>();
  for (const e of entries) {
    const project = e.projectTask.project;
    entryCountByProject.set(project.id, (entryCountByProject.get(project.id) ?? 0) + 1);
    if (!adminIdsByProject.has(project.id)) {
      adminIdsByProject.set(project.id, project.members.map((m) => m.userId));
    }
  }
  if (entryCountByProject.size === 0) return { approverIds: [], selfAdministered: false };

  const [winningProjectId] = [...entryCountByProject.entries()].sort((a, b) => b[1] - a[1])[0];
  const approverIds = adminIdsByProject.get(winningProjectId) ?? [];
  // selfAdministered reflects the REAL project admin set, before any
  // delegate is folded in below — a delegate who happens to be the
  // submitter shouldn't trigger auto-approval.
  const selfAdministered = approverIds.includes(timesheet.userId);

  // Fold in anyone covering for a resolved admin today via a nominated
  // proxy (see routes/delegations.ts) — added, not swapped in, so the
  // original admin can still act too if they're reachable after all.
  if (approverIds.length > 0) {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const activeDelegations = await prisma.delegation.findMany({
      where: { active: true, fromUserId: { in: approverIds }, startDate: { lte: today }, endDate: { gte: today } },
    });
    for (const d of activeDelegations) {
      if (!approverIds.includes(d.toUserId)) approverIds.push(d.toUserId);
    }
  }

  return { approverIds, selfAdministered };
}

/**
 * Whether a user is a real Project Admin on at least one project, via an
 * actual ProjectMember row — independent of their global `role` on the
 * User table. A project's admin list is explicitly meant to be assignable
 * to anyone (spec: "a project can have several admins"), so someone whose
 * global role is e.g. HR_ADMIN can still legitimately co-administer a
 * project (see prisma/seed.ts: Shibani co-administers ERP alongside
 * Ramesh). Route-level `requireRole(PROJECT_ADMIN, SUPER_ADMIN)` checks
 * only the global role and would incorrectly lock such a person out of the
 * entire approvals system — this is the check that should gate access
 * instead, alongside `approverIds.includes(userId)` for a specific
 * timesheet (see doApprove/doReject in routes/approvals.ts).
 */
export async function isProjectAdminAnywhere(userId: number): Promise<boolean> {
  const count = await prisma.projectMember.count({ where: { userId, roleOnProject: PROJECT_MEMBER_ROLE.PROJECT_ADMIN } });
  return count > 0;
}
