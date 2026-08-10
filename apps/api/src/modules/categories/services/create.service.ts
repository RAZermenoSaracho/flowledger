import { prisma } from "../../../db/prisma.js";

/** Creates a personal (non-group) category owned by `userId`. */
export async function createCategory(
  userId: string,
  input: { name: string; type: "income" | "expense"; color?: string | null }
) {
  return prisma.category.create({
    data: {
      ...input,
      groupId: null,
      users: { create: { userId } }
    }
  });
}
