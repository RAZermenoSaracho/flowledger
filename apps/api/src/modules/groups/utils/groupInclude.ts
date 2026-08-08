import type { CategoryType } from "@prisma/client";

/** Builds a Prisma `include` for a group's members and categories, filtered to `userId`'s accessible categories with optional archive/type/sort options. */
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
