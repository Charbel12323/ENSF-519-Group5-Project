import { createHash, randomBytes } from "node:crypto";
import { TokenPurpose } from "@prisma/client";
import { prisma } from "./prisma";
import { Db } from "./access";
import { HttpError } from "../middleware/errorHandler";

export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function issueToken(userId: string, email: string, purpose: TokenPurpose, minutes: number) {
  const token = randomBytes(32).toString("hex");
  await prisma.authToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.authToken.create({ data: { userId, email, purpose, hash: tokenHash(token), expiresAt: new Date(Date.now() + minutes * 60000) } });
  return token;
}

export async function consumeToken<T>(token: string, purpose: TokenPurpose, action: (db: Db, userId: string) => Promise<T>) {
  return prisma.$transaction(async (db) => {
    const hash = tokenHash(token);
    const found = await db.authToken.findUnique({ where: { hash } });
    if (!found || found.purpose !== purpose || found.expiresAt < new Date()) throw new HttpError(400, "This link is invalid or expired");
    await db.$queryRaw`SELECT id FROM "User" WHERE id = ${found.userId} FOR UPDATE`;
    const user = await db.user.findUniqueOrThrow({ where: { id: found.userId } });
    if (user.email !== found.email) throw new HttpError(400, "This link is no longer valid");
    const consumed = await db.authToken.deleteMany({ where: { id: found.id, expiresAt: { gt: new Date() } } });
    if (!consumed.count) throw new HttpError(400, "This link has already been used");
    return action(db, found.userId);
  });
}
