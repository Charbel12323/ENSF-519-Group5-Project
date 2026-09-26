import { randomBytes, createHash } from "node:crypto";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { issueToken } from "../lib/tokens";
import { AuthedRequest } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

const cookieName = "boardly_oauth";
const cookieOptions = { httpOnly: true, secure: env.apiUrl.startsWith("https:"), sameSite: "lax" as const, path: "/api/auth/google", maxAge: 10 * 60000 };
const client = () => new OAuth2Client(env.googleClientId, env.googleClientSecret, `${env.apiUrl}/api/auth/google/callback`);
export function providers(_req: Request, res: Response) {
  res.json({ google: !!(env.googleClientId && env.googleClientSecret) });
}

export async function startGoogle(req: AuthedRequest, res: Response) {
  if (!env.googleClientId || !env.googleClientSecret) throw new HttpError(503, "Google login is not configured");
  const state = randomBytes(32).toString("hex");
  const nonce = randomBytes(32).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const current = req.userId ? await prisma.user.findUniqueOrThrow({ where: { id: req.userId } }) : undefined;
  const flow = jwt.sign({ state, nonce, verifier, userId: req.userId, version: current?.authVersion }, env.jwtSecret, { expiresIn: "10m", audience: "google-oauth" });
  res.cookie(cookieName, flow, cookieOptions);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: env.googleClientId, redirect_uri: `${env.apiUrl}/api/auth/google/callback`,
    response_type: "code", scope: "openid email profile", state, nonce, prompt: "select_account",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
  if (req.userId) res.json({ url: url.toString() });
  else res.redirect(url.toString());
}

export async function googleCallback(req: Request, res: Response) {
  res.clearCookie(cookieName, cookieOptions);
  try {
    const cookie = req.headers.cookie?.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!cookie || typeof req.query.code !== "string" || typeof req.query.state !== "string") throw new Error("Invalid callback");
    const flow = jwt.verify(decodeURIComponent(cookie), env.jwtSecret, { algorithms: ["HS256"], audience: "google-oauth" }) as { state: string; nonce: string; verifier: string; userId?: string; version?: number };
    if (flow.state !== req.query.state) throw new Error("Invalid state");
    const oauth = client();
    const { tokens } = await oauth.getToken({ code: req.query.code, codeVerifier: flow.verifier });
    if (!tokens.id_token) throw new Error("No identity token");
    const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: env.googleClientId });
    const identity = ticket.getPayload();
    const nonce = (identity as unknown as { nonce?: string })?.nonce;
    if (!identity?.email || !identity.email_verified || nonce !== flow.nonce) throw new Error("Unverified identity");
    const email = identity.email.toLowerCase();
    let user;
    if (flow.userId) {
      const current = await prisma.user.findUniqueOrThrow({ where: { id: flow.userId } });
      if (current.email !== email || !current.emailVerifiedAt || current.authVersion !== flow.version) throw new Error("Verify and use the same email to link Google");
      user = await prisma.user.update({ where: { id: current.id }, data: { googleId: identity.sub } });
    } else {
      user = await prisma.user.findUnique({ where: { googleId: identity.sub } });
      if (!user) {
        if (await prisma.user.findUnique({ where: { email } })) {
          return res.redirect(`${env.appUrl}/login?error=${encodeURIComponent("An account already uses that email. Sign in with your password, then connect Google from Profile.")}`);
        }
        user = await prisma.user.create({ data: { email, name: identity.name ?? email.split("@")[0], googleId: identity.sub, emailVerifiedAt: new Date() } });
      }
    }
    const code = await issueToken(user.id, user.email, "LOGIN", 1);
    res.redirect(`${env.appUrl}/auth/callback#code=${code}`);
  } catch {
    res.redirect(`${env.appUrl}/login?error=${encodeURIComponent("Google sign-in failed. Please try again. To connect an existing account, verify its email and use that same Google account.")}`);
  }
}
