import { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { hashPassword, verifyPassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { HttpError } from "../middleware/errorHandler";
import { AuthedRequest } from "../middleware/auth";

const signupSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function toPublicUser(user: { id: string; name: string; email: string }) {
  return { id: user.id, name: user.name, email: user.email };
}

export async function signup(req: AuthedRequest, res: Response) {
  const body = signupSchema.parse(req.body);
  const email = body.email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new HttpError(409, "An account with this email already exists");
  }

  const passwordHash = await hashPassword(body.password);
  const user = await prisma.user.create({
    data: { name: body.name.trim(), email, passwordHash },
  });

  // Auto-accept any pending invites sent to this email before the account existed.
  await prisma.groupInvite.updateMany({
    where: { email, status: "PENDING" },
    data: { recipientId: user.id },
  });

  const token = signToken({ userId: user.id });
  res.status(201).json({ token, user: toPublicUser(user) });
}

export async function login(req: AuthedRequest, res: Response) {
  const body = loginSchema.parse(req.body);
  const email = body.email.toLowerCase().trim();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new HttpError(401, "Invalid email or password");
  }

  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    throw new HttpError(401, "Invalid email or password");
  }

  const token = signToken({ userId: user.id });
  res.json({ token, user: toPublicUser(user) });
}

export async function me(req: AuthedRequest, res: Response) {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    throw new HttpError(404, "User not found");
  }
  res.json({ user: toPublicUser(user) });
}
