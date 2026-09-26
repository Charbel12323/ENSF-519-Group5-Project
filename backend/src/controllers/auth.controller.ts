import { Response } from "express";
import { z } from "zod";
import { User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { hashPassword, verifyPassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { HttpError } from "../middleware/errorHandler";
import { AuthedRequest } from "../middleware/auth";
import { consumeToken, issueToken } from "../lib/tokens";
import { sendMail } from "../lib/mail";
import { env } from "../config/env";

const emailSchema = z.string().trim().toLowerCase().email();
const passwordSchema = z.string().min(8, "Password must be at least 8 characters").refine((s) => Buffer.byteLength(s) <= 72, "Password must be at most 72 bytes");
export function toPublicUser(user: User) {
  return { id: user.id, name: user.name, email: user.email, emailVerified: !!user.emailVerifiedAt, googleConnected: !!user.googleId, hasPassword: !!user.passwordHash };
}
export function session(user: User) {
  return { token: signToken({ userId: user.id, version: user.authVersion }), user: toPublicUser(user) };
}

async function verificationEmail(user: User) {
  const token = await issueToken(user.id, user.email, "VERIFY_EMAIL", 24 * 60);
  return sendMail(user.email, "Verify your Boardly email", `Confirm your email address (this link expires in 24 hours):\n\n${env.appUrl}/verify-email#token=${token}`);
}

export async function signup(req: AuthedRequest, res: Response) {
  const body = z.object({ name: z.string().trim().min(1).max(100), email: emailSchema, password: passwordSchema }).parse(req.body);
  if (await prisma.user.findUnique({ where: { email: body.email } })) throw new HttpError(409, "An account with this email already exists");
  const user = await prisma.user.create({ data: { name: body.name, email: body.email, passwordHash: await hashPassword(body.password) } });
  // Link pending invitations; accepting still requires verified ownership of the email.
  await prisma.groupInvite.updateMany({ where: { email: user.email, status: "PENDING" }, data: { recipientId: user.id } });
  const emailSent = await verificationEmail(user);
  res.status(201).json({ ...session(user), emailSent });
}

export async function login(req: AuthedRequest, res: Response) {
  const body = z.object({ email: emailSchema, password: z.string().min(1).max(200) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user?.passwordHash || !await verifyPassword(body.password, user.passwordHash)) throw new HttpError(401, "Invalid email or password");
  res.json(session(user));
}

export async function me(req: AuthedRequest, res: Response) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
  res.json({ user: toPublicUser(user) });
}

export async function resendVerification(req: AuthedRequest, res: Response) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
  if (user.emailVerifiedAt) return res.json({ emailSent: true, message: "Email is already verified" });
  const emailSent = await verificationEmail(user);
  res.json({ emailSent, message: emailSent ? "Verification email sent" : "Email delivery failed. Please try again later" });
}

export async function verifyEmail(req: AuthedRequest, res: Response) {
  const { token } = z.object({ token: z.string().length(64) }).parse(req.body);
  await consumeToken(token, "VERIFY_EMAIL", async (db, userId) => {
    await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    await db.authToken.deleteMany({ where: { userId, purpose: "VERIFY_EMAIL" } });
  });
  res.json({ ok: true });
}

export async function forgotPassword(req: AuthedRequest, res: Response) {
  const { email } = z.object({ email: emailSchema }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = await issueToken(user.id, email, "RESET_PASSWORD", 30);
    await sendMail(email, "Reset your Boardly password", `Set a new password using this link (expires in 30 minutes):\n\n${env.appUrl}/reset-password#token=${token}\n\nIf you did not request this, you can ignore this email.`);
  }
  res.json({ message: "If an account exists for that email, a reset link has been sent" });
}

export async function resetPassword(req: AuthedRequest, res: Response) {
  const { token, password } = z.object({ token: z.string().length(64), password: passwordSchema }).parse(req.body);
  const passwordHash = await hashPassword(password);
  await consumeToken(token, "RESET_PASSWORD", async (db, userId) => {
    await db.user.update({ where: { id: userId }, data: { passwordHash, authVersion: { increment: 1 }, emailVerifiedAt: new Date() } });
    await db.authToken.deleteMany({ where: { userId } });
  });
  res.json({ ok: true });
}

export async function updateProfile(req: AuthedRequest, res: Response) {
  const body = z.object({ name: z.string().trim().min(1).max(100), email: emailSchema, currentPassword: z.string().max(200).optional() }).parse(req.body);
  const user = await prisma.$transaction(async (db) => {
    await db.$queryRaw`SELECT id FROM "User" WHERE id = ${req.userId!} FOR UPDATE`;
    const old = await db.user.findUniqueOrThrow({ where: { id: req.userId } });
    const changingEmail = old.email !== body.email;
    if (changingEmail) {
      if (!old.passwordHash || !body.currentPassword || !await verifyPassword(body.currentPassword, old.passwordHash)) throw new HttpError(400, "Enter your current password to change email. Google-only accounts can set a password using password reset first");
      await db.authToken.deleteMany({ where: { userId: old.id } });
    }
    return db.user.update({ where: { id: old.id }, data: { name: body.name, email: body.email,
      ...(changingEmail ? { emailVerifiedAt: null, googleId: null, authVersion: { increment: 1 } } : {}) } });
  });
  const emailSent = !user.emailVerifiedAt ? await verificationEmail(user) : true;
  res.json({ ...session(user), emailSent });
}

export async function exchangeLogin(req: AuthedRequest, res: Response) {
  const { code } = z.object({ code: z.string().length(64) }).parse(req.body);
  const user = await consumeToken(code, "LOGIN", (db, id) => db.user.findUniqueOrThrow({ where: { id } }));
  res.json(session(user));
}
