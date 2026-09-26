import { NextFunction, Request, Response } from "express";
import { ParamsDictionary } from "express-serve-static-core";
import { verifyToken } from "../utils/jwt";
import { prisma } from "../lib/prisma";

export interface AuthedRequest<P extends ParamsDictionary = ParamsDictionary> extends Request<P> {
  userId?: string;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = header.slice("Bearer ".length);
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  if (!payload.userId) return res.status(401).json({ error: "Invalid token" });
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || user.authVersion !== (payload.version ?? 0)) return res.status(401).json({ error: "Please sign in again" });
  req.userId = user.id;
  next();
}
