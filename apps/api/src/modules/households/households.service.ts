import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../utils/httpError.js";

export async function getHouseholdMembership(userId: string, householdId?: string | null) {
  if (!householdId) return null;

  const member = await prisma.householdMember.findFirst({
    where: { householdId, userId }
  });

  if (!member) {
    throw new HttpError(400, "Household does not exist for this user");
  }

  return member;
}

export async function getHouseholdAdmin(userId: string, householdId: string) {
  const member = await prisma.householdMember.findFirst({
    where: { householdId, userId, role: "admin" }
  });

  if (!member) {
    throw new HttpError(404, "Household not found");
  }

  return member;
}

export async function assertHouseholdCategory(
  userId: string,
  householdId?: string | null,
  householdCategoryId?: string | null
) {
  if (!householdCategoryId) return null;
  if (!householdId) {
    throw new HttpError(400, "Household category requires a household");
  }

  await getHouseholdMembership(userId, householdId);

  const category = await prisma.category.findFirst({
    where: { id: householdCategoryId, householdId, users: { some: { userId } } }
  });

  if (!category) {
    throw new HttpError(400, "Household category does not exist for this household");
  }

  return category;
}

export async function grantHouseholdCategoriesToUser(
  tx: Prisma.TransactionClient,
  householdId: string,
  userId: string
) {
  const categories = await tx.category.findMany({
    where: { householdId },
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

export async function revokeHouseholdCategoriesFromUser(
  tx: Prisma.TransactionClient,
  householdId: string,
  userId: string
) {
  await tx.categoryUser.deleteMany({
    where: {
      userId,
      category: { householdId }
    }
  });
}
