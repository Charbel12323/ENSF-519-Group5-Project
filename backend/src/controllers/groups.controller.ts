import { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { HttpError } from "../middleware/errorHandler";
import { AuthedRequest } from "../middleware/auth";

const DEFAULT_COLUMNS = ["To Do", "In Progress", "Done"];

const createGroupSchema = z.object({
  name: z.string().min(1, "Group name is required").max(100),
});

const inviteSchema = z.object({
  email: z.string().email(),
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

export async function createGroup(req: AuthedRequest, res: Response) {
  const body = createGroupSchema.parse(req.body);
  const userId = req.userId!;

  const group = await prisma.group.create({
    data: {
      name: body.name.trim(),
      ownerId: userId,
      members: { create: { userId, role: "OWNER" } },
      columns: {
        create: DEFAULT_COLUMNS.map((name, index) => ({ name, order: index })),
      },
    },
    include: { columns: { orderBy: { order: "asc" } }, members: true },
  });

  res.status(201).json({ group });
}

export async function listGroups(req: AuthedRequest, res: Response) {
  const userId = req.userId!;
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    include: {
      group: {
        include: { _count: { select: { members: true, tasks: true } } },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  const groups = memberships.map((m) => ({
    id: m.group.id,
    name: m.group.name,
    role: m.role,
    memberCount: m.group._count.members,
    taskCount: m.group._count.tasks,
  }));

  res.json({ groups });
}

export async function getGroup(req: AuthedRequest<{ groupId: string }>, res: Response) {
  const { groupId } = req.params;
  await requireMembership(groupId, req.userId!);

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      columns: { orderBy: { order: "asc" } },
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });

  if (!group) {
    throw new HttpError(404, "Group not found");
  }

  res.json({ group });
}

export async function inviteMember(req: AuthedRequest<{ groupId: string }>, res: Response) {
  const { groupId } = req.params;
  const body = inviteSchema.parse(req.body);
  const email = body.email.toLowerCase().trim();
  const userId = req.userId!;

  await requireMembership(groupId, userId);

  const existingMember = await prisma.groupMember.findFirst({
    where: { groupId, user: { email } },
  });
  if (existingMember) {
    throw new HttpError(409, "That person is already a member of this group");
  }

  const invitedUser = await prisma.user.findUnique({ where: { email } });

  const invite = await prisma.groupInvite.upsert({
    where: { groupId_email: { groupId, email } },
    create: {
      groupId,
      email,
      invitedById: userId,
      recipientId: invitedUser?.id,
    },
    update: {
      status: "PENDING",
      invitedById: userId,
      recipientId: invitedUser?.id,
    },
  });

  res.status(201).json({ invite });
}

export async function listMyInvites(req: AuthedRequest, res: Response) {
  const userId = req.userId!;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const invites = await prisma.groupInvite.findMany({
    where: { email: user.email, status: "PENDING" },
    include: {
      group: { select: { id: true, name: true } },
      invitedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({ invites });
}

export async function respondToInvite(req: AuthedRequest<{ inviteId: string }>, res: Response) {
  const { inviteId } = req.params;
  const responseSchema = z.object({ accept: z.boolean() });
  const { accept } = responseSchema.parse(req.body);
  const userId = req.userId!;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const invite = await prisma.groupInvite.findUnique({ where: { id: inviteId } });

  if (!invite || invite.email !== user.email) {
    throw new HttpError(404, "Invite not found");
  }
  if (invite.status !== "PENDING") {
    throw new HttpError(409, "This invite has already been responded to");
  }

  if (accept) {
    await prisma.$transaction([
      prisma.groupInvite.update({
        where: { id: inviteId },
        data: { status: "ACCEPTED", recipientId: userId },
      }),
      prisma.groupMember.upsert({
        where: { groupId_userId: { groupId: invite.groupId, userId } },
        create: { groupId: invite.groupId, userId, role: "MEMBER" },
        update: {},
      }),
    ]);
  } else {
    await prisma.groupInvite.update({
      where: { id: inviteId },
      data: { status: "DECLINED", recipientId: userId },
    });
  }

  res.json({ ok: true });
}
