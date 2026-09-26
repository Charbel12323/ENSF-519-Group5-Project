import { Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { Db, inGroup, membership, publicUser, record } from "../lib/access";
import { insertAt, normalizeTasks } from "../lib/order";
import { HttpError } from "../middleware/errorHandler";
import { AuthedRequest } from "../middleware/auth";
import { notify, mentionedEmails } from "../lib/notifications";
import { validateDependencies, assertCanComplete } from "../lib/dependencies";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const parsed = new Date(s); return !isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === s;
}, "Use a valid date").transform((s) => new Date(s));
const fields = z.object({
  title: z.string().trim().min(1).max(200), description: z.string().trim().max(2000).nullable().optional(),
  columnId: z.string().uuid(), assigneeId: z.string().uuid().nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(), dueDate: date.nullable().optional(),
  labelIds: z.array(z.string().uuid()).max(30).optional(),
});
const update = fields.partial().extend({ order: z.number().int().min(0).optional(), archived: z.boolean().optional(), dependencyIds: z.array(z.string().uuid()).max(50).optional() });
export const taskInclude = {
  assignee: { select: publicUser }, creator: { select: publicUser }, labels: true,
  subtasks: { orderBy: { createdAt: "asc" as const } },
  column: true,
  dependencies: { include: { dependsOn: { select: { id: true, title: true, archivedAt: true, column: { select: { isDone: true } } } } } },
  _count: { select: { comments: true, attachments: true } },
};
const attachmentSelect = { id: true, name: true, size: true, createdAt: true, uploaderId: true } as const;
type TaskRequest = AuthedRequest<{ taskId: string; itemId: string }>;

async function taskAccess(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new HttpError(404, "Task not found");
  await membership(prisma, task.groupId, userId);
  return task;
}

async function mutate<T>(req: TaskRequest, action: (db: Db, task: NonNullable<Awaited<ReturnType<typeof taskAccess>>>) => Promise<T>) {
  const existing = await taskAccess(req.params.taskId, req.userId!);
  return inGroup(existing.groupId, req.userId!, false, async (db) => {
    const task = await db.task.findUnique({ where: { id: existing.id } });
    if (!task) throw new HttpError(404, "Task not found");
    return action(db, task);
  });
}

async function validateRelations(db: Db, groupId: string, body: z.infer<typeof update>) {
  if (body.columnId && !await db.column.findFirst({ where: { id: body.columnId, groupId } })) throw new HttpError(400, "Column must belong to this group");
  if (body.assigneeId && !await db.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: body.assigneeId } } })) throw new HttpError(400, "Assignee must be a group member");
  if (body.labelIds) {
    const count = await db.label.count({ where: { id: { in: body.labelIds }, groupId } });
    if (count !== new Set(body.labelIds).size) throw new HttpError(400, "Labels must belong to this group");
  }
}

const filters = z.object({
  q: z.string().max(200).optional(), columnId: z.string().uuid().optional(),
  assigneeId: z.union([z.string().uuid(), z.literal("unassigned")]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(), labelId: z.string().uuid().optional(),
  due: z.enum(["overdue", "today", "week", "none"]).optional(),
  archived: z.enum(["true", "false"]).optional(),
});
function filterWhere(query: unknown): Prisma.TaskWhereInput {
  const f = filters.parse(query);
  const today = new Date(new Date().toISOString().slice(0, 10));
  return {
    archivedAt: f.archived === "true" ? { not: null } : null,
    ...(f.q ? { OR: [{ title: { contains: f.q, mode: "insensitive" } }, { description: { contains: f.q, mode: "insensitive" } }] } : {}),
    ...(f.columnId ? { columnId: f.columnId } : {}),
    ...(f.assigneeId ? { assigneeId: f.assigneeId === "unassigned" ? null : f.assigneeId } : {}),
    ...(f.priority ? { priority: f.priority } : {}),
    ...(f.labelId ? { labels: { some: { id: f.labelId } } } : {}),
    ...(f.due ? { dueDate: f.due === "none" ? null : f.due === "overdue" ? { lt: today } : f.due === "today" ? today : { gte: today, lte: new Date(today.valueOf() + 7 * 86400000) } } : {}),
  };
}

export async function listTasks(req: AuthedRequest<{ groupId: string }>, res: Response) {
  await membership(prisma, req.params.groupId, req.userId!);
  const tasks = await prisma.task.findMany({ where: { ...filterWhere(req.query), groupId: req.params.groupId },
    include: taskInclude, orderBy: [{ columnId: "asc" }, { order: "asc" }, { id: "asc" }] });
  res.json({ tasks });
}

export async function myTasks(req: AuthedRequest, res: Response) {
  const tasks = await prisma.task.findMany({ where: { ...filterWhere(req.query), assigneeId: req.userId,
    group: { members: { some: { userId: req.userId } } } },
    include: { ...taskInclude, group: { select: { id: true, name: true } }, column: true },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }] });
  res.json({ tasks });
}

export async function getTask(req: TaskRequest, res: Response) {
  await taskAccess(req.params.taskId, req.userId!);
  const task = await prisma.task.findUniqueOrThrow({ where: { id: req.params.taskId }, include: {
    ...taskInclude, comments: { include: { author: { select: publicUser } }, orderBy: { createdAt: "asc" } },
    attachments: { select: attachmentSelect, orderBy: { createdAt: "desc" } },
    activity: { include: { actor: { select: publicUser } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 },
  } });
  res.json({ task });
}

export async function createTask(req: AuthedRequest<{ groupId: string }>, res: Response) {
  const body = fields.parse(req.body);
  const task = await inGroup(req.params.groupId, req.userId!, false, async (db) => {
    await validateRelations(db, req.params.groupId, body);
    await normalizeTasks(db, body.columnId);
    const { labelIds, ...data } = body;
    const task = await db.task.create({ data: { ...data, groupId: req.params.groupId, creatorId: req.userId!,
      order: await db.task.count({ where: { columnId: body.columnId } }), labels: { connect: labelIds?.map((id) => ({ id })) } }, include: taskInclude });
    await record(db, task.groupId, req.userId!, `Created task "${task.title}"`, task.id);
    await notify(db, task.assigneeId, req.userId!, task.groupId, "ASSIGNED", `You were assigned "${task.title}"`, task.id);
    return task;
  });
  res.status(201).json({ task });
}

export async function updateTask(req: TaskRequest, res: Response) {
  const body = update.parse(req.body);
  const task = await mutate(req, async (db, existing) => {
    await validateRelations(db, existing.groupId, body);
    const { labelIds, order, archived, dependencyIds, ...data } = body;
    const columnId = body.columnId ?? existing.columnId;
    if (dependencyIds) await validateDependencies(db, existing.groupId, existing.id, dependencyIds);
    const blockers = dependencyIds ?? (await db.taskDependency.findMany({ where: { taskId: existing.id } })).map((d) => d.dependsOnId);
    const column = await db.column.findUniqueOrThrow({ where: { id: columnId } });
    if (column.isDone) await assertCanComplete(db, blockers);
    if (dependencyIds) {
      await db.taskDependency.deleteMany({ where: { taskId: existing.id } });
      await db.taskDependency.createMany({ data: dependencyIds.map((dependsOnId) => ({ taskId: existing.id, dependsOnId })) });
    }
    if (columnId !== existing.columnId || order !== undefined) {
      const destination = await db.task.findMany({ where: { columnId, id: { not: existing.id } }, orderBy: [{ order: "asc" }, { id: "asc" }] });
      await normalizeTasks(db, columnId, insertAt(destination, existing, order ?? destination.length).map((t) => t.id));
      if (columnId !== existing.columnId) await normalizeTasks(db, existing.columnId);
    }
    const task = await db.task.update({ where: { id: existing.id }, data: { ...data,
      ...(archived !== undefined ? { archivedAt: archived ? existing.archivedAt ?? new Date() : null } : {}),
      ...(labelIds ? { labels: { set: labelIds.map((id) => ({ id })) } } : {}) }, include: taskInclude });
    const changes: string[] = [];
    if (columnId !== existing.columnId) {
      const previous = await db.column.findUniqueOrThrow({ where: { id: existing.columnId } });
      changes.push(`status: ${previous.name} → ${column.name}`);
    }
    if (body.assigneeId !== undefined && body.assigneeId !== existing.assigneeId) {
      const previous = existing.assigneeId ? await db.user.findUnique({ where: { id: existing.assigneeId } }) : null;
      changes.push(`assignee: ${previous?.name ?? "Unassigned"} → ${task.assignee?.name ?? "Unassigned"}`);
      await notify(db, task.assigneeId, req.userId!, task.groupId, "ASSIGNED", `You were assigned "${task.title}"`, task.id);
    }
    if (body.dueDate !== undefined && body.dueDate?.valueOf() !== existing.dueDate?.valueOf()) changes.push(`due date: ${existing.dueDate?.toISOString().slice(0, 10) ?? "None"} → ${task.dueDate?.toISOString().slice(0, 10) ?? "None"}`);
    if (archived !== undefined && !!existing.archivedAt !== archived) changes.push(archived ? "archived" : "restored from archive");
    if (dependencyIds) changes.push("dependencies");
    for (const key of ["title", "description", "priority"] as const) if (body[key] !== undefined && body[key] !== existing[key]) changes.push(key);
    if (labelIds) changes.push("labels");
    if (order !== undefined && order !== existing.order) changes.push("position");
    if (changes.length) await record(db, task.groupId, req.userId!, `Updated "${task.title}" — ${changes.join("; ")}`, task.id);
    return task;
  });
  res.json({ task });
}

export async function deleteTask(req: TaskRequest, res: Response) {
  await mutate(req, async (db, task) => {
    await record(db, task.groupId, req.userId!, `Deleted task "${task.title}"`);
    await db.task.delete({ where: { id: task.id } });
    await normalizeTasks(db, task.columnId);
  });
  res.status(204).send();
}

export async function saveSubtask(req: TaskRequest, res: Response) {
  const body = z.object({ title: z.string().trim().min(1).max(200).optional(), completed: z.boolean().optional() }).parse(req.body);
  const subtask = await mutate(req, async (db, task) => {
    if (!req.params.itemId && !body.title) throw new HttpError(400, "Title is required");
    const subtask = req.params.itemId ? await db.subtask.update({ where: { id: req.params.itemId, taskId: task.id }, data: body })
      : await db.subtask.create({ data: { title: body.title!, taskId: task.id } });
    await record(db, task.groupId, req.userId!, `${req.params.itemId ? "Updated" : "Added"} subtask "${subtask.title}"${body.completed === undefined ? "" : body.completed ? " (complete)" : " (incomplete)"}`, task.id);
    return subtask;
  });
  res.json({ subtask });
}

export async function deleteSubtask(req: TaskRequest, res: Response) {
  await mutate(req, async (db, task) => {
    const subtask = await db.subtask.delete({ where: { id: req.params.itemId, taskId: task.id } });
    await record(db, task.groupId, req.userId!, `Deleted subtask "${subtask.title}"`, task.id);
  });
  res.status(204).send();
}

export async function saveComment(req: TaskRequest, res: Response) {
  const { body } = z.object({ body: z.string().trim().min(1).max(5000) }).parse(req.body);
  const comment = await mutate(req, async (db, task) => {
    let previousBody = "";
    if (req.params.itemId) {
      const comment = await db.comment.findFirst({ where: { id: req.params.itemId, taskId: task.id } });
      if (!comment) throw new HttpError(404, "Comment not found");
      if (comment.authorId !== req.userId) throw new HttpError(403, "Only the author can edit a comment");
      previousBody = comment.body;
    }
    const comment = req.params.itemId ? await db.comment.update({ where: { id: req.params.itemId }, data: { body } })
      : await db.comment.create({ data: { body, taskId: task.id, authorId: req.userId! } });
    await record(db, task.groupId, req.userId!, req.params.itemId ? "Edited a comment" : "Added a comment", task.id);
    const previousMentions = mentionedEmails(previousBody);
    const emails = [...mentionedEmails(body)].filter((email) => !previousMentions.has(email));
    const members = await db.groupMember.findMany({ where: { groupId: task.groupId, user: { email: { in: emails } } } });
    for (const member of members) await notify(db, member.userId, req.userId!, task.groupId, "MENTION", `You were mentioned in a comment on "${task.title}"`, task.id);
    return comment;
  });
  res.json({ comment });
}

export async function deleteComment(req: TaskRequest, res: Response) {
  await mutate(req, async (db, task) => {
    const comment = await db.comment.findFirst({ where: { id: req.params.itemId, taskId: task.id } });
    if (!comment) throw new HttpError(404, "Comment not found");
    const member = await membership(db, task.groupId, req.userId!);
    if (comment.authorId !== req.userId && member.role !== "OWNER") throw new HttpError(403, "Only the author or group owner can delete a comment");
    await db.comment.delete({ where: { id: comment.id } });
    await record(db, task.groupId, req.userId!, "Deleted a comment", task.id);
  });
  res.status(204).send();
}

export async function uploadAttachment(req: TaskRequest, res: Response) {
  if (!req.file) throw new HttpError(400, "Choose a file (maximum 5 MB)");
  const file = req.file;
  const attachment = await mutate(req, async (db, task) => {
    if (await db.attachment.count({ where: { taskId: task.id } }) >= 20) throw new HttpError(400, "Maximum 20 attachments per task");
    const name = file.originalname.replace(/[\\/\x00-\x1f\x7f]/g, "_").slice(0, 200) || "attachment";
    const attachment = await db.attachment.create({ data: { name, size: file.size, content: new Uint8Array(file.buffer),
      taskId: task.id, uploaderId: req.userId! }, select: attachmentSelect });
    await record(db, task.groupId, req.userId!, `Attached ${name}`, task.id);
    return attachment;
  });
  res.status(201).json({ attachment });
}

export async function downloadAttachment(req: TaskRequest, res: Response) {
  await taskAccess(req.params.taskId, req.userId!);
  const file = await prisma.attachment.findFirst({ where: { id: req.params.itemId, taskId: req.params.taskId } });
  if (!file) throw new HttpError(404, "Attachment not found");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  res.attachment(file.name).type("application/octet-stream").send(Buffer.from(file.content));
}

export async function deleteAttachment(req: TaskRequest, res: Response) {
  await mutate(req, async (db, task) => {
    const file = await db.attachment.findFirst({ where: { id: req.params.itemId, taskId: task.id } });
    if (!file) throw new HttpError(404, "Attachment not found");
    const member = await membership(db, task.groupId, req.userId!);
    if (file.uploaderId !== req.userId && member.role !== "OWNER") throw new HttpError(403, "Only the uploader or group owner can delete an attachment");
    await db.attachment.delete({ where: { id: file.id } });
    await record(db, task.groupId, req.userId!, `Removed attachment ${file.name}`, task.id);
  });
  res.status(204).send();
}
