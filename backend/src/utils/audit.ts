import { prisma } from "../lib/prisma";

export async function writeAuditLog(params: {
  actorId?: number | null;
  entityType: string;
  entityId?: number | null;
  action: string;
  before?: unknown;
  after?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId ?? null,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      action: params.action,
      beforeState: params.before !== undefined ? JSON.stringify(params.before) : null,
      afterState: params.after !== undefined ? JSON.stringify(params.after) : null,
    },
  });
}
