import { prisma } from "../../../db/prisma.js";
import { getEditableCategory } from "../utils/getEditableCategory.js";

export async function deleteCategory(userId: string, categoryId: string) {
  const existing = await getEditableCategory(userId, categoryId);
  await prisma.category.delete({ where: { id: existing.id } });
}
