import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { HttpError } from "../middleware/errorHandler";

export const publicUser = { id: true, name: true, email: true } as const;
export type Db = Prisma.TransactionClient;

export async function membership(db: Db, groupId: string, userId: string, ownerOnly = false) {
  const member = await db.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
  if (!member) throw new HttpError(403, "You are not a member of this group");
  if (ownerOnly && member.role !== "OWNER") throw new HttpError(403, "Only the group owner can do this");
  return member;
}

// Serialize all mutations for a group, including authorization checks. This prevents
// concurrent moves, membership changes, or ownership transfers from racing.
export async function inGroup<T>(groupId: string, userId: string, ownerOnly: boolean, action: (db: Db) => Promise<T>) {
  return prisma.$transaction(async (db) => {
    const rows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "Group" WHERE id = ${groupId} FOR UPDATE`;
    if (!rows.length) throw new HttpError(404, "Group not found");
    await membership(db, groupId, userId, ownerOnly);
    return action(db);
  }, { timeout: 15000 });
}

export function record(db: Db, groupId: string, actorId: string, message: string, taskId?: string) {
  return db.activity.create({ data: { groupId, actorId, message, taskId } });
}
