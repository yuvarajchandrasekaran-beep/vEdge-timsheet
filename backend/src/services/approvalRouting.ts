import { prisma } from "../lib/prisma";
import { ROLES, PROJECT_MEMBER_ROLE } from "../constants/enums";

/**
 * Default approval chain per spec 3.3: Level 1 = the Project Admin(s) of the
 * project(s) on the timesheet, Level 2 = any HR Admin (final, org-wide).
 * Per-project/department overrides live in ApprovalChainConfig but are not
 * yet consulted here — see SCHEMA_REFERENCE.md "Extension points".
 *
 * A project can have several admins (ProjectMember rows with
 * roleOnProject = "Project Admin"), so Level 1 resolves to a *set* of
 * eligible approvers rather than a single user: whichever project
 * contributed the most entries to the timesheet (if a week spans several
 * projects), any one of that project's admins may act.
 */
export async function resolveLevel1Approver(timesheetId: number): Promise<{ approverIds: number[]; selfAdministered: boolean }> {
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
  return { approverIds, selfAdministered: approverIds.includes(timesheet.userId) };
}

export async function resolveLevel2Approver(): Promise<number | null> {
  const hrAdmin = await prisma.user.findFirst({ where: { role: { name: ROLES.HR_ADMIN }, status: "ACTIVE" }, orderBy: { id: "asc" } });
  return hrAdmin?.id ?? null;
}
