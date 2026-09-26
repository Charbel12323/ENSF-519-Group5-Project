import { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { membership, publicUser } from "../lib/access";
import { statusResolver, startOfToday } from "../lib/status";
import { AuthedRequest } from "../middleware/auth";
import { date } from "./tasks.controller";

const DAY = 86400000;
const UPCOMING_DAYS = 7;
const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

export async function getGroupDashboard(req: AuthedRequest<{ groupId: string }>, res: Response) {
  const { groupId } = req.params;
  await membership(prisma, groupId, req.userId!);
  // The client may pass its local date so "overdue" and "due today" match the viewer's calendar.
  const { today: clientToday } = z.object({ today: date.optional() }).parse(req.query);
  const today = clientToday ?? startOfToday();
  const upcomingLimit = new Date(today.valueOf() + UPCOMING_DAYS * DAY);

  const [columns, tasks, members] = await Promise.all([
    prisma.column.findMany({ where: { groupId }, orderBy: { order: "asc" } }),
    prisma.task.findMany({ where: { groupId }, include: { assignee: { select: publicUser } } }),
    prisma.groupMember.findMany({ where: { groupId }, include: { user: { select: publicUser } }, orderBy: { joinedAt: "asc" } }),
  ]);

  const statusOf = statusResolver(columns);
  const rows = tasks.map((task) => {
    const status = statusOf(task.columnId);
    const overdue = status !== "DONE" && !!task.dueDate && task.dueDate < today;
    const upcoming = status !== "DONE" && !!task.dueDate && task.dueDate >= today && task.dueDate <= upcomingLimit;
    return { task, status, overdue, upcoming };
  });
  const count = (predicate: (row: (typeof rows)[number]) => boolean) => rows.filter(predicate).length;
  const completed = count((r) => r.status === "DONE");

  const team = members.map((member) => {
    const mine = rows.filter((r) => r.task.assigneeId === member.userId);
    const done = mine.filter((r) => r.status === "DONE").length;
    return {
      userId: member.user.id, name: member.user.name, email: member.user.email, role: member.role,
      assigned: mine.length, completed: done,
      inProgress: mine.filter((r) => r.status === "IN_PROGRESS").length,
      notStarted: mine.filter((r) => r.status === "TODO").length,
      overdue: mine.filter((r) => r.overdue).length,
      completionPercent: percent(done, mine.length),
    };
  });

  const deadlines = rows
    .filter((r) => r.task.dueDate)
    .sort((a, b) => a.task.dueDate!.valueOf() - b.task.dueDate!.valueOf())
    .map((r) => ({
      id: r.task.id, title: r.task.title, dueDate: r.task.dueDate, assignee: r.task.assignee, status: r.status,
      deadline: r.status === "DONE" ? "COMPLETED" : r.overdue ? "OVERDUE" : r.task.dueDate!.valueOf() === today.valueOf() ? "TODAY" : "UPCOMING",
    }));

  res.json({
    totalTasks: tasks.length,
    totalMembers: members.length,
    unassignedCount: count((r) => !r.task.assigneeId),
    tasksByColumn: columns.map((column) => ({
      columnId: column.id, columnName: column.name, status: statusOf(column.id),
      count: tasks.filter((t) => t.columnId === column.id).length,
    })),
    tasksByAssignee: team.map((m) => ({ userId: m.userId, name: m.name, email: m.email, count: m.assigned })),
    summary: {
      completed,
      inProgress: count((r) => r.status === "IN_PROGRESS"),
      notStarted: count((r) => r.status === "TODO"),
      overdue: count((r) => r.overdue),
      upcoming: count((r) => r.upcoming),
      completionPercent: percent(completed, tasks.length),
      upcomingDays: UPCOMING_DAYS,
    },
    team,
    deadlines,
  });
}
