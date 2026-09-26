import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { MulterError } from "multer";

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof MulterError) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Maximum file size is 5 MB" : "Upload one file at a time" });
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return res.status(409).json({ error: "That email, name, or position is already in use" });
    if (err.code === "P2025") return res.status(404).json({ error: "Item not found" });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}
