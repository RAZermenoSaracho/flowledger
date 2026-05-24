import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../utils/httpError.js";

export async function getGroupMembership(
  userId: string,
  groupId?: string | null
) {
  if (!groupId) return null;

  const member = await prisma.groupMember.findFirst({
    where: { groupId, userId }
  });

  if (!member) {
    throw new HttpError(400, "Group does not exist for this user");
  }

  return member;
}

export async function getGroupAdmin(userId: string, groupId: string) {
  const member = await prisma.groupMember.findFirst({
    where: { groupId, userId, role: "admin" }
  });

  if (!member) {
    throw new HttpError(404, "Group not found");
  }

  return member;
}

export async function assertCategory(
  userId: string,
  groupId?: string | null,
  categoryId?: string | null
) {
  if (!categoryId) return null;
  if (!groupId) {
    throw new HttpError(400, "Group category requires a group");
  }

  await getGroupMembership(userId, groupId);

  const category = await prisma.category.findFirst({
    where: {
      id: categoryId,
      groupId,
      isArchived: false,
      group: { isArchived: false },
      users: { some: { userId } }
    }
  });

  if (!category) {
    throw new HttpError(400, "Group category does not exist or is archived");
  }

  return category;
}

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

export async function revokeGroupCategoriesFromUser(
  tx: Prisma.TransactionClient,
  groupId: string,
  userId: string
) {
  await tx.categoryUser.deleteMany({
    where: {
      userId,
      category: { groupId }
    }
  });
}
