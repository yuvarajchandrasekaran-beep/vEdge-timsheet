import { prisma } from "../lib/prisma";
import { PROJECT_MEMBER_ROLE } from "../constants/enums";

// A standing, never-expiring, non-billable project every employee can log
// time against for things that aren't client work — PTO, jury duty, a
// company-wide admin day, an internal meeting with no project of its own.
// Without this, the only answer to "how do I log a leave day?" was "you
// can't" (see Query Log 1 #17). Identified by CODE (stable, never
// renamed by an admin), not by name or id, so this keeps working even if
// someone edits the display name later or across environments where
// auto-increment ids differ (local dev vs. production).
export const DEFAULT_PROJECT_CODE = "TOA-01";
const DEFAULT_PROJECT_NAME = "Time Off & Admin";
const DEFAULT_PROJECT_CLIENT_NAME = "Vivid Edge";
const DEFAULT_PROJECT_TASK_NAMES = ["PTO", "Jury Duty", "Meeting", "Admin"];

/** Idempotent — finds the standing project/tasks if they already exist,
 * creates whatever's missing otherwise. Safe to call on every startup or
 * from a one-off backfill script against an existing environment. */
export async function ensureDefaultProject(): Promise<{ id: number; taskIds: number[] }> {
  let client = await prisma.client.findUnique({ where: { name: DEFAULT_PROJECT_CLIENT_NAME } });
  if (!client) {
    client = await prisma.client.create({ data: { name: DEFAULT_PROJECT_CLIENT_NAME } });
  }

  let project = await prisma.project.findUnique({ where: { code: DEFAULT_PROJECT_CODE } });
  if (!project) {
    project = await prisma.project.create({
      data: {
        clientId: client.id,
        code: DEFAULT_PROJECT_CODE,
        name: DEFAULT_PROJECT_NAME,
        description: "Standing, non-billable project for time off and internal admin work — every employee is a member by default.",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: null,
        status: "ACTIVE",
      },
    });
  }

  const existingTasks = await prisma.projectTask.findMany({ where: { projectId: project.id } });
  const existingNames = new Set(existingTasks.map((t) => t.name));
  const taskIds = [...existingTasks.map((t) => t.id)];
  for (const name of DEFAULT_PROJECT_TASK_NAMES) {
    if (existingNames.has(name)) continue;
    const task = await prisma.projectTask.create({ data: { projectId: project.id, name, billable: false } });
    taskIds.push(task.id);
  }

  return { id: project.id, taskIds };
}

/** Adds one user to the standing default project, if they aren't already a
 * member — called right after a user is created (single-create and bulk
 * import) so every new employee can log leave/admin time from day one.
 * Takes the project id rather than re-resolving it, so a bulk import can
 * call ensureDefaultProject() once up front instead of once per row. */
export async function enrollInDefaultProject(userId: number, projectId: number): Promise<void> {
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    update: {},
    create: { projectId, userId, roleOnProject: PROJECT_MEMBER_ROLE.MEMBER },
  });
}
