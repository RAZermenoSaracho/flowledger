import { prisma } from "../../../db/prisma.js";
import { getEditableCategory } from "./read.service.js";

/** Deletes a category after confirming `userId` may edit it. */
export async function deleteCategory(userId: string, categoryId: string) {
  const existing = await getEditableCategory(userId, categoryId);
  await prisma.category.delete({ where: { id: existing.id } });
}
