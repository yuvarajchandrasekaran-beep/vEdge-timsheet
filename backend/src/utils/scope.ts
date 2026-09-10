import { prisma } from "../lib/prisma";
import { ApiError } from "./errors";
import { ROLES, PROJECT_MEMBER_ROLE } from "../constants/enums";
import { AuthUser } from "../middleware/auth";

export async function assertProjectScope(user: AuthUser, projectId: number) {
  if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.HR_ADMIN) return;
  if (user.role === ROLES.PROJECT_ADMIN) {
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });
    if (!membership || membership.roleOnProject !== PROJECT_MEMBER_ROLE.PROJECT_ADMIN) {
      throw ApiError.forbidden("Not an admin of this project");
    }
    return;
  }
  throw ApiError.forbidden();
}
