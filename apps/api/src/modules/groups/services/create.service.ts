import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { HttpError, notFound } from "../../../utils/httpError.js";
import { createNotifications } from "../../notifications/services/create.service.js";
import { groupInclude } from "../utils/groupInclude.js";
import { getGroupAdmin } from "./read.service.js";

/** Gives a newly added group member `CategoryUser` access to all the group's active categories. */
export async function grantGroupCategoriesToUser(
  tx: Prisma.TransactionClient,
  groupId: string,
  userId: string
) {
  const categories = await tx.category.findMany({
    where: { groupId, isArchived: false },
    select: { id: true }
  });

  if (categories.length === 0) return;

  await tx.categoryUser.createMany({
    data: categories.map((category) => ({
      categoryId: category.id,
      userId
    })),
    skipDuplicates: true
  });
}

/** Creates a group owned by `userId`, seeding the owner as its first admin member. */
export async function createGroup(
  userId: string,
  input: { name: string; description?: string | null }
) {
  return prisma.group.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      ownerUserId: userId,
      members: {
        create: {
          userId,
          role: "admin"
        }
      }
    },
    include: groupInclude(userId)
  });
}

/** Adds a member to a group; requires `userId` to be a group admin and the group to be active. */
export async function addGroupMember(
  userId: string,
  groupId: string,
  memberUserId: string
) {
  await getGroupAdmin(userId, groupId);

  if (memberUserId === userId) {
    throw new HttpError(400, "You are already a group member");
  }

  const existingGroup = await prisma.group.findUnique({
    where: { id: groupId },
    select: { isArchived: true }
  });
  if (!existingGroup) throw notFound("Group");
  if (existingGroup.isArchived) {
    throw new HttpError(400, "Archived groups cannot add members");
  }

  const user = await prisma.user.findUnique({
    where: { id: memberUserId },
    select: { id: true }
  });
  if (!user) throw new HttpError(400, "User does not exist");

  const existingMember = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: {
        groupId,
        userId: memberUserId
      }
    }
  });
  if (existingMember) {
    throw new HttpError(409, "User is already a group member");
  }

  return prisma.$transaction(async (tx) => {
    const group = await tx.group.findUnique({
      where: { id: groupId },
      select: { id: true, name: true }
    });
    if (!group) throw notFound("Group");

    const createdMember = await tx.groupMember.create({
      data: {
        groupId,
        userId: memberUserId,
        role: "member"
      },
      include: { user: { select: { id: true, name: true, email: true } } }
    });

    await grantGroupCategoriesToUser(tx, groupId, memberUserId);

    await createNotifications(tx, [
      {
        userId: memberUserId,
        type: "group_member_added",
        title: "Added to group",
        message: `You were added to ${group.name}.`,
        metadata: { groupId: group.id }
      }
    ]);

    return createdMember;
  });
}

/** Adds a shared category to a group, granting all current members access to it; requires `userId` to be a group admin. */
export async function addGroupCategory(
  userId: string,
  groupId: string,
  input: { name: string; type: "income" | "expense"; color?: string | null }
) {
  await getGroupAdmin(userId, groupId);

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { isArchived: true }
  });
  if (!group) throw notFound("Group");
  if (group.isArchived) {
    throw new HttpError(400, "Archived groups cannot add categories");
  }

  return prisma.$transaction(async (tx) => {
    const members = await tx.groupMember.findMany({
      where: { groupId },
      select: { userId: true }
    });

    return tx.category.create({
      data: {
        groupId,
        name: input.name,
        type: input.type,
        color: input.color ?? null,
        users: {
          create: members.map((member) => ({ userId: member.userId }))
        }
      }
    });
  });
}
