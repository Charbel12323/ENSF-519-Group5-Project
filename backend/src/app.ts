import express from "express";
import cors from "cors";
import { ZodError } from "zod";
import { env } from "./config/env";
import authRoutes from "./routes/auth.routes";
import groupRoutes from "./routes/groups.routes";
import inviteRoutes from "./routes/invites.routes";
import taskRoutes from "./routes/tasks.routes";
import { errorHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/groups", groupRoutes);
  app.use("/api/invites", inviteRoutes);
  app.use("/api/tasks", taskRoutes);

  app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.issues[0]?.message ?? "Invalid request" });
    }
    return errorHandler(err, req, res, next);
  });

  return app;
}
