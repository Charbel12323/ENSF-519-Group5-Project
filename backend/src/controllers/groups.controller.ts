import { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { AuthedRequest } from "../middleware/auth";
import { inGroup, membership, publicUser, record } from "../lib/access";
import { normalizeTasks, orderColumns } from "../lib/order";
import { sendMail } from "../lib/mail";
import { env } from "../config/env";

const nameSchema = z.object({ name: z.string().trim().min(1).max(100) });
type GroupRequest = AuthedRequest<{ groupId: string; userId: string; columnId: string; labelId: string }>;
const detail = { columns: { orderBy: { order: "asc" as const } }, members: { include: { user: { select: publicUser } } }, labels: { orderBy: { name: "asc" as const } } };

export async function createGroup(req: AuthedRequest, res: Response) {
  const { name } = nameSchema.parse(req.body);
  const group = await prisma.group.create({ data: {
    name, ownerId: req.userId!, members: { create: { userId: req.userId!, role: "OWNER" } },
    columns: { create: ["To Do", "In Progress", "Done"].map((name, order) => ({ name, order })) },
    activity: { create: { actorId: req.userId!, message: "Created the group" } },
  }, include: detail });
  res.status(201).json({ group });
}

export async function listGroups(req: AuthedRequest, res: Response) {
  const memberships = await prisma.groupMember.findMany({ where: { userId: req.userId },
    include: { group: { include: { _count: { select: { members: true, tasks: true } } } } }, orderBy: { joinedAt: "asc" } });
  res.json({ groups: memberships.map((m) => ({ id: m.group.id, name: m.group.name, role: m.role,
    memberCount: m.group._count.members, taskCount: m.group._count.tasks })) });
}

export async function getGroup(req: GroupRequest, res: Response) {
  await membership(prisma, req.params.groupId, req.userId!);
  res.json({ group: await prisma.group.findUniqueOrThrow({ where: { id: req.params.groupId }, include: detail }) });
}

export async function renameGroup(req: GroupRequest, res: Response) {
  const { name } = nameSchema.parse(req.body);
  const group = await inGroup(req.params.groupId, req.userId!, true, async (db) => {
    await record(db, req.params.groupId, req.userId!, `Renamed the group to ${name}`);
    return db.group.update({ where: { id: req.params.groupId }, data: { name } });
  });
  res.json({ group });
}

export async function deleteGroup(req: GroupRequest, res: Response) {
  await inGroup(req.params.groupId, req.userId!, true, (db) => db.group.delete({ where: { id: req.params.groupId } }));
  res.status(204).send();
}

export async function removeMember(req: GroupRequest, res: Response) {
  const targetId = req.params.userId ?? req.userId!;
  const { groupId } = req.params;
  await inGroup(groupId, req.userId!, targetId !== req.userId, async (db) => {
    const target = await membership(db, groupId, targetId);
    if (target.role === "OWNER") throw new HttpError(409, "Transfer ownership before leaving the group");
    const user = await db.user.findUniqueOrThrow({ where: { id: targetId } });
    await db.task.updateMany({ where: { groupId, assigneeId: targetId }, data: { assigneeId: null } });
    await db.groupMember.delete({ where: { id: target.id } });
    await record(db, groupId, req.userId!, targetId === req.userId ? "Left the group; assigned tasks are now unassigned" : `Removed ${user.name}; their tasks are now unassigned`);
  });
  res.status(204).send();
}

export async function transferOwnership(req: GroupRequest, res: Response) {
  const { userId } = z.object({ userId: z.string().uuid() }).parse(req.body);
  await inGroup(req.params.groupId, req.userId!, true, async (db) => {
    if (userId === req.userId) throw new HttpError(400, "Choose another member");
    await membership(db, req.params.groupId, userId);
    await db.groupMember.update({ where: { groupId_userId: { groupId: req.params.groupId, userId: req.userId! } }, data: { role: "MEMBER" } });
    await db.groupMember.update({ where: { groupId_userId: { groupId: req.params.groupId, userId } }, data: { role: "OWNER" } });
    await db.group.update({ where: { id: req.params.groupId }, data: { ownerId: userId } });
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await record(db, req.params.groupId, req.userId!, `Transferred ownership to ${user.name}`);
  });
  res.json({ ok: true });
}

export async function inviteMember(req: GroupRequest, res: Response) {
  const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(req.body);
  const { groupId } = req.params;
  const result = await inGroup(groupId, req.userId!, true, async (db) => {
    const owner = await db.user.findUniqueOrThrow({ where: { id: req.userId! } });
    if (!owner.emailVerifiedAt) throw new HttpError(403, "Verify your email before inviting people");
    if (await db.groupMember.findFirst({ where: { groupId, user: { email } } })) throw new HttpError(409, "That person is already a member");
    const user = await db.user.findUnique({ where: { email } });
    const invite = await db.groupInvite.upsert({ where: { groupId_email: { groupId, email } },
      create: { groupId, email, invitedById: req.userId!, recipientId: user?.id },
      update: { status: "PENDING", invitedById: req.userId!, recipientId: user?.id ?? null, createdAt: new Date() } });
    const group = await db.group.findUniqueOrThrow({ where: { id: groupId } });
    await record(db, groupId, req.userId!, `Invited ${email}`);
    return { invite, group, owner };
  });
  const emailSent = await sendMail(email, `Invitation to ${result.group.name} on Boardly`,
    `${result.owner.name} invited you to ${result.group.name}. Sign in or create an account using ${email}, verify your email, then accept your invitation on your groups page.\n\n${env.appUrl}/dashboard`);
  res.status(201).json({ invite: result.invite, emailSent });
}

export async function listMyInvites(req: AuthedRequest, res: Response) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } });
  const invites = await prisma.groupInvite.findMany({ where: { email: user.email, status: "PENDING" },
    include: { group: { select: { id: true, name: true } }, invitedBy: { select: publicUser } }, orderBy: { createdAt: "desc" } });
  res.json({ invites });
}

export async function respondToInvite(req: AuthedRequest<{ inviteId: string }>, res: Response) {
  const { accept } = z.object({ accept: z.boolean() }).parse(req.body);
  const candidate = await prisma.groupInvite.findUnique({ where: { id: req.params.inviteId } });
  if (!candidate) throw new HttpError(404, "Invite not found");
  await prisma.$transaction(async (db) => {
    await db.$queryRaw`SELECT id FROM "Group" WHERE id = ${candidate.groupId} FOR UPDATE`;
    const user = await db.user.findUniqueOrThrow({ where: { id: req.userId } });
    const invite = await db.groupInvite.findUnique({ where: { id: req.params.inviteId } });
    if (!invite || invite.email !== user.email) throw new HttpError(404, "Invite not found");
    if (accept && !user.emailVerifiedAt) throw new HttpError(403, "Verify your email before accepting invitations");
    if (invite.status !== "PENDING") throw new HttpError(409, "This invitation has already been answered");
    await db.groupInvite.update({ where: { id: invite.id }, data: { status: accept ? "ACCEPTED" : "DECLINED", recipientId: user.id } });
    if (accept) {
      await db.groupMember.upsert({ where: { groupId_userId: { groupId: invite.groupId, userId: user.id } },
        create: { groupId: invite.groupId, userId: user.id }, update: {} });
      await record(db, invite.groupId, user.id, "Joined the group");
    }
  });
  res.json({ ok: true });
}

export async function createColumn(req: GroupRequest, res: Response) {
  const { name } = nameSchema.parse(req.body);
  const column = await inGroup(req.params.groupId, req.userId!, true, async (db) => {
    const order = await db.column.count({ where: { groupId: req.params.groupId } });
    await record(db, req.params.groupId, req.userId!, `Created column ${name}`);
    return db.column.create({ data: { name, groupId: req.params.groupId, order } });
  });
  res.status(201).json({ column });
}

export async function renameColumn(req: GroupRequest, res: Response) {
  const { name } = nameSchema.parse(req.body);
  const column = await inGroup(req.params.groupId, req.userId!, true, async (db) => {
    await record(db, req.params.groupId, req.userId!, `Renamed a column to ${name}`);
    return db.column.update({ where: { id: req.params.columnId, groupId: req.params.groupId }, data: { name } });
  });
  res.json({ column });
}

export async function reorderColumns(req: GroupRequest, res: Response) {
  const { columnIds } = z.object({ columnIds: z.array(z.string().uuid()).min(1) }).parse(req.body);
  await inGroup(req.params.groupId, req.userId!, true, async (db) => {
    const current = await db.column.findMany({ where: { groupId: req.params.groupId } });
    if (columnIds.length !== current.length || new Set(columnIds).size !== current.length || current.some((c) => !columnIds.includes(c.id))) throw new HttpError(409, "Columns changed. Refresh and try again");
    await orderColumns(db, req.params.groupId, columnIds);
    await record(db, req.params.groupId, req.userId!, "Reordered columns");
  });
  res.json({ ok: true });
}

export async function deleteColumn(req: GroupRequest, res: Response) {
  const { moveToColumnId } = z.object({ moveToColumnId: z.string().uuid().optional() }).parse(req.body ?? {});
  await inGroup(req.params.groupId, req.userId!, true, async (db) => {
    const columns = await db.column.findMany({ where: { groupId: req.params.groupId }, orderBy: { order: "asc" } });
    const source = columns.find((c) => c.id === req.params.columnId);
    if (!source) throw new HttpError(404, "Column not found");
    if (columns.length === 1) throw new HttpError(409, "Keep at least one column");
    const tasks = await db.task.findMany({ where: { columnId: source.id }, orderBy: [{ order: "asc" }, { id: "asc" }] });
    if (tasks.length) {
      if (!moveToColumnId || moveToColumnId === source.id || !columns.some((c) => c.id === moveToColumnId)) throw new HttpError(400, "Choose a destination for this column's tasks");
      const destination = await db.task.findMany({ where: { columnId: moveToColumnId }, orderBy: [{ order: "asc" }, { id: "asc" }] });
      await normalizeTasks(db, moveToColumnId, [...destination, ...tasks].map((t) => t.id));
    }
    await db.column.delete({ where: { id: source.id } });
    await orderColumns(db, req.params.groupId, columns.filter((c) => c.id !== source.id).map((c) => c.id));
    await record(db, req.params.groupId, req.userId!, `Deleted column ${source.name}${tasks.length ? " and moved its tasks" : ""}`);
  });
  res.status(204).send();
}

export async function saveLabel(req: GroupRequest, res: Response) {
  const body = z.object({ name: z.string().trim().min(1).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).parse(req.body);
  const label = await inGroup(req.params.groupId, req.userId!, true, async (db) => {
    const label = req.params.labelId ? await db.label.update({ where: { id: req.params.labelId, groupId: req.params.groupId }, data: body })
      : await db.label.create({ data: { ...body, groupId: req.params.groupId } });
    await record(db, req.params.groupId, req.userId!, `${req.params.labelId ? "Updated" : "Created"} label ${body.name}`);
    return label;
  });
  res.json({ label });
}

export async function deleteLabel(req: GroupRequest, res: Response) {
  await inGroup(req.params.groupId, req.userId!, true, async (db) => {
    const label = await db.label.delete({ where: { id: req.params.labelId, groupId: req.params.groupId } });
    await record(db, req.params.groupId, req.userId!, `Deleted label ${label.name}`);
  });
  res.status(204).send();
}

export async function listActivity(req: GroupRequest, res: Response) {
  await membership(prisma, req.params.groupId, req.userId!);
  const { cursor } = z.object({ cursor: z.string().uuid().optional() }).parse(req.query);
  const activity = await prisma.activity.findMany({ where: { groupId: req.params.groupId },
    include: { actor: { select: publicUser } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
  res.json({ activity, nextCursor: activity.length === 50 ? activity[49].id : null });
}
