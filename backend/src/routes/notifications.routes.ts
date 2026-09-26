import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);
function visible(userId: string): Prisma.NotificationWhereInput {
  return { recipientId: userId, OR: [
    { group: { members: { some: { userId } } } },
    { kind: "INVITE", group: { invites: { some: { recipientId: userId, status: "PENDING" } } } },
  ] };
}
router.get("/", async (req, res) => {
  const { cursor } = z.object({ cursor: z.string().uuid().optional() }).parse(req.query);
  const where = visible(req.userId!);
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
  ]);
  res.json({ notifications, unreadCount, nextCursor: notifications.length === 30 ? notifications[29].id : null });
});
router.patch("/read", async (req, res) => {
  const { id } = z.object({ id: z.string().uuid().optional() }).parse(req.body);
  await prisma.notification.updateMany({ where: { ...visible(req.userId!), readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } });
  res.json({ ok: true });
});
export default router;
