import express from "express";
import cors from "cors";
import { ZodError } from "zod";
import { env } from "./config/env";
import authRoutes from "./routes/auth.routes";
import groupRoutes from "./routes/groups.routes";
import inviteRoutes from "./routes/invites.routes";
import taskRoutes from "./routes/tasks.routes";
import notificationRoutes from "./routes/notifications.routes";
import { errorHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.disable("x-powered-by");
  app.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/groups", groupRoutes);
  app.use("/api/invites", inviteRoutes);
  app.use("/api/tasks", taskRoutes);
  app.use("/api/notifications", notificationRoutes);

  app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.issues[0]?.message ?? "Invalid request" });
    }
    return errorHandler(err, req, res, next);
  });

  return app;
}
