import { prisma } from "../../../db/prisma.js";
import { getEditableCategory } from "../utils/getEditableCategory.js";

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

export async function archiveCategory(userId: string, categoryId: string) {
  const existing = await getEditableCategory(userId, categoryId);

  return prisma.category.update({
    where: { id: existing.id },
    data: { isArchived: true, archivedAt: new Date() }
  });
}

export async function restoreCategory(userId: string, categoryId: string) {
  const existing = await getEditableCategory(userId, categoryId);

  return prisma.category.update({
    where: { id: existing.id },
    data: { isArchived: false, archivedAt: null }
  });
}
