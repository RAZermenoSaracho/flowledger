import { prisma } from "../../../db/prisma.js";

export async function searchUsers(
  excludeUserId: string,
  query: string,
  limit: number
) {
  return prisma.user.findMany({
    where: {
      id: { not: excludeUserId },
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } }
      ]
    },
    select: {
      id: true,
      name: true,
      email: true
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    take: limit
  });
}

export async function getCurrentUser(userId: string) {
  return prisma.user.findUniqueOrThrow({ where: { id: userId } });
}
