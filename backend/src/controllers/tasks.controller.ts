import { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { AuthedRequest } from "../middleware/auth";

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(2000).optional().nullable(),
  columnId: z.string().uuid(),
  assigneeId: z.string().uuid().optional().nullable(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  columnId: z.string().uuid().optional(),
  order: z.number().int().min(0).optional(),
  assigneeId: z.string().uuid().optional().nullable(),
});

async function requireMembership(groupId: string, userId: string) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership) {
    throw new HttpError(403, "You are not a member of this group");
  }
  return membership;
}

const taskInclude = {
  assignee: { select: { id: true, name: true, email: true } },
  creator: { select: { id: true, name: true, email: true } },
};

export async function listTasks(req: AuthedRequest<{ groupId: string }>, res: Response) {
  const { groupId } = req.params;
  await requireMembership(groupId, req.userId!);

  const tasks = await prisma.task.findMany({
    where: { groupId },
    include: taskInclude,
    orderBy: [{ columnId: "asc" }, { order: "asc" }],
  });

  res.json({ tasks });
}

export async function createTask(req: AuthedRequest<{ groupId: string }>, res: Response) {
  const { groupId } = req.params;
  const body = createTaskSchema.parse(req.body);
  const userId = req.userId!;
  await requireMembership(groupId, userId);

  const column = await prisma.column.findFirst({ where: { id: body.columnId, groupId } });
  if (!column) {
    throw new HttpError(404, "Column not found in this group");
  }

  if (body.assigneeId) {
    const isMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: body.assigneeId } },
    });
    if (!isMember) {
      throw new HttpError(400, "Assignee must be a member of this group");
    }
  }

  const maxOrder = await prisma.task.aggregate({
    where: { columnId: body.columnId },
    _max: { order: true },
  });

  const task = await prisma.task.create({
    data: {
      title: body.title.trim(),
      description: body.description?.trim() || null,
      groupId,
      columnId: body.columnId,
      assigneeId: body.assigneeId ?? null,
      creatorId: userId,
      order: (maxOrder._max.order ?? -1) + 1,
    },
    include: taskInclude,
  });

  res.status(201).json({ task });
}

export async function updateTask(req: AuthedRequest<{ taskId: string }>, res: Response) {
  const { taskId } = req.params;
  const body = updateTaskSchema.parse(req.body);
  const userId = req.userId!;

  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) {
    throw new HttpError(404, "Task not found");
  }
  await requireMembership(existing.groupId, userId);

  if (body.columnId) {
    const column = await prisma.column.findFirst({
      where: { id: body.columnId, groupId: existing.groupId },
    });
    if (!column) {
      throw new HttpError(404, "Column not found in this group");
    }
  }

  if (body.assigneeId) {
    const isMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: existing.groupId, userId: body.assigneeId } },
    });
    if (!isMember) {
      throw new HttpError(400, "Assignee must be a member of this group");
    }
  }

  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      title: body.title?.trim(),
      description: body.description === undefined ? undefined : body.description?.trim() || null,
      columnId: body.columnId,
      order: body.order,
      assigneeId: body.assigneeId === undefined ? undefined : body.assigneeId,
    },
    include: taskInclude,
  });

  res.json({ task });
}

export async function deleteTask(req: AuthedRequest<{ taskId: string }>, res: Response) {
  const { taskId } = req.params;
  const userId = req.userId!;

  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) {
    throw new HttpError(404, "Task not found");
  }
  await requireMembership(existing.groupId, userId);

  await prisma.task.delete({ where: { id: taskId } });
  res.status(204).send();
}
