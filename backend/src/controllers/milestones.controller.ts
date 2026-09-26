import { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { inGroup, membership, record } from "../lib/access";
import { HttpError } from "../middleware/errorHandler";
import { AuthedRequest } from "../middleware/auth";
import { date } from "./tasks.controller";

type MilestoneRequest = AuthedRequest<{ groupId: string; milestoneId: string }>;
const fields = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  dueDate: date,
});

export async function listMilestones(req: MilestoneRequest, res: Response) {
  await membership(prisma, req.params.groupId, req.userId!);
  const milestones = await prisma.milestone.findMany({ where: { groupId: req.params.groupId }, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] });
  res.json({ milestones });
}

export async function createMilestone(req: MilestoneRequest, res: Response) {
  const body = fields.parse(req.body);
  const milestone = await inGroup(req.params.groupId, req.userId!, true, async (db) => {
    const milestone = await db.milestone.create({ data: { ...body, groupId: req.params.groupId } });
    await record(db, req.params.groupId, req.userId!, `Created milestone "${milestone.title}"`);
    return milestone;
  });
  res.status(201).json({ milestone });
}

export async function updateMilestone(req: MilestoneRequest, res: Response) {
  const body = fields.partial().parse(req.body);
  const milestone = await inGroup(req.params.groupId, req.userId!, true, async (db) => {
    if (!await db.milestone.findFirst({ where: { id: req.params.milestoneId, groupId: req.params.groupId } })) throw new HttpError(404, "Milestone not found");
    const milestone = await db.milestone.update({ where: { id: req.params.milestoneId }, data: body });
    await record(db, req.params.groupId, req.userId!, `Updated milestone "${milestone.title}"`);
    return milestone;
  });
  res.json({ milestone });
}

export async function deleteMilestone(req: MilestoneRequest, res: Response) {
  await inGroup(req.params.groupId, req.userId!, true, async (db) => {
    const milestone = await db.milestone.findFirst({ where: { id: req.params.milestoneId, groupId: req.params.groupId } });
    if (!milestone) throw new HttpError(404, "Milestone not found");
    await db.milestone.delete({ where: { id: milestone.id } });
    await record(db, req.params.groupId, req.userId!, `Deleted milestone "${milestone.title}"`);
  });
  res.status(204).send();
}
