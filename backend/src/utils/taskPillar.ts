import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ApiError } from "./errors";

// Prisma include that loads a task's Sub-Pillar and, through it, its Pillar.
export const SUB_PILLAR_INCLUDE = { subPillar: { include: { pillar: true } } } as const;

// `null` clears the tag; omitted leaves it unchanged.
export const subPillarIdInput = z.union([z.null(), z.coerce.number().int().positive()]).optional();

/** The Pillar/Sub-Pillar fields every task-shaped API response carries. */
export function pillarFields(task: {
  subPillarId: number | null;
  subPillar?: { name: string; pillar: { name: string } } | null;
}) {
  return {
    subPillarId: task.subPillarId,
    subPillarName: task.subPillar?.name ?? null,
    pillarName: task.subPillar?.pillar.name ?? null,
  };
}

export async function assertSubPillarExists(subPillarId: number | null | undefined) {
  if (subPillarId == null) return;
  const subPillar = await prisma.subPillar.findUnique({ where: { id: subPillarId } });
  if (!subPillar) throw ApiError.badRequest("That Sub-Pillar no longer exists — pick another one.");
}
