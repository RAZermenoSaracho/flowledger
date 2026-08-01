import type { CategoryType } from "@prisma/client";

export function groupInclude(
  userId: string,
  includeArchivedCategories = false,
  categorySort?: {
    sortBy?: "name" | "createdAt" | "updatedAt";
    sortDirection?: "asc" | "desc";
  },
  categoryTypes?: string[]
) {
  return {
    members: {
      include: {
        user: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: "asc" as const }
    },
    categories: {
      where: {
        users: { some: { userId } },
        ...(includeArchivedCategories ? {} : { isArchived: false }),
        ...(categoryTypes?.length
          ? { type: { in: categoryTypes as CategoryType[] } }
          : {})
      },
      orderBy: categorySort?.sortBy
        ? [{ [categorySort.sortBy]: categorySort.sortDirection ?? "asc" }]
        : [{ type: "asc" as const }, { name: "asc" as const }]
    }
  };
}
