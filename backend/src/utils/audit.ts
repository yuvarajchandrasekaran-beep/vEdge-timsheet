import { prisma } from "../lib/prisma";

export async function writeAuditLog(params: {
  actorId?: number | null;
  // Set when the request was made during a Super Admin impersonation
  // session — records who was really behind the wheel, distinct from
  // actorId (the impersonated user the action is attributed to).
  impersonatedById?: number | null;
  entityType: string;
  entityId?: number | null;
  action: string;
  before?: unknown;
  after?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId ?? null,
      impersonatedById: params.impersonatedById ?? null,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      action: params.action,
      beforeState: params.before !== undefined ? JSON.stringify(params.before) : null,
      afterState: params.after !== undefined ? JSON.stringify(params.after) : null,
    },
  });
}
