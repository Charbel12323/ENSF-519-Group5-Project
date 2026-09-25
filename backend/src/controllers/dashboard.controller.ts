import { Response } from "express";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { AuthedRequest } from "../middleware/auth";

async function requireMembership(groupId: string, userId: string) {
  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!membership) {
    throw new HttpError(403, "You are not a member of this group");
  }
}

export async function getGroupDashboard(req: AuthedRequest<{ groupId: string }>, res: Response) {
  const { groupId } = req.params;
  await requireMembership(groupId, req.userId!);

  const [columns, tasks, members] = await Promise.all([
    prisma.column.findMany({ where: { groupId }, orderBy: { order: "asc" } }),
    prisma.task.findMany({
      where: { groupId },
      include: { assignee: { select: { id: true, name: true, email: true } } },
    }),
    prisma.groupMember.findMany({
      where: { groupId },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  const tasksByColumn = columns.map((column) => ({
    columnId: column.id,
    columnName: column.name,
    count: tasks.filter((t) => t.columnId === column.id).length,
  }));

  const tasksByAssignee = members.map((member) => ({
    userId: member.user.id,
    name: member.user.name,
    email: member.user.email,
    count: tasks.filter((t) => t.assigneeId === member.user.id).length,
  }));

  const unassignedCount = tasks.filter((t) => !t.assigneeId).length;

  res.json({
    totalTasks: tasks.length,
    totalMembers: members.length,
    tasksByColumn,
    tasksByAssignee,
    unassignedCount,
  });
}
