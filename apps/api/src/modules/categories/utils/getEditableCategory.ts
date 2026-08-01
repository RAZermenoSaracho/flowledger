import { prisma } from "../../../db/prisma.js";
import { notFound } from "../../../utils/httpError.js";
import { getGroupAdmin } from "../../groups/services/read.service.js";

export async function getEditableCategory(userId: string, categoryId: string) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, users: { some: { userId } } }
  });
  if (!category) throw notFound("Category");
  if (category.groupId) {
    await getGroupAdmin(userId, category.groupId);
  }
  return category;
}
