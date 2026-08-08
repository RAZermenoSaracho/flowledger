import { prisma } from "../../../db/prisma.js";
import { getEditableCategory } from "./read.service.js";

/** Updates a category's name/type/color after confirming `userId` may edit it. */
export async function updateCategory(
  userId: string,
  categoryId: string,
  input: { name?: string; type?: "income" | "expense"; color?: string | null }
) {
  const existing = await getEditableCategory(userId, categoryId);

  return prisma.category.update({
    where: { id: existing.id },
    data: input
  });
}

/** Marks a category archived, recording `archivedAt`. */
export async function archiveCategory(userId: string, categoryId: string) {
  const existing = await getEditableCategory(userId, categoryId);

  return prisma.category.update({
    where: { id: existing.id },
    data: { isArchived: true, archivedAt: new Date() }
  });
}

/** Un-archives a category, clearing `archivedAt`. */
export async function restoreCategory(userId: string, categoryId: string) {
  const existing = await getEditableCategory(userId, categoryId);

  return prisma.category.update({
    where: { id: existing.id },
    data: { isArchived: false, archivedAt: null }
  });
}
