import type { CategoryType, Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { notFound } from "../../../utils/httpError.js";
import { getGroupAdmin, getGroupMembership } from "../../groups/services/read.service.js";

/** Fetches a category the user is allowed to edit: their own personal category, or a group category where they're a group admin. */
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

function categoryOrderBy(filters: {
  sortBy?: "name" | "createdAt" | "updatedAt";
  sortDirection?: "asc" | "desc";
}): Prisma.CategoryOrderByWithRelationInput[] {
  if (filters.sortBy) {
    return [{ [filters.sortBy]: filters.sortDirection ?? "asc" }];
  }

  return [{ type: "asc" }, { name: "asc" }];
}

/** Lists categories visible to `userId` for the given scope (all/group/personal), archived state, type, and sort filters. */
export async function listCategories(
  userId: string,
  filters: {
    groupId?: string;
    scope?: "all";
    includeArchived?: string;
    sortBy?: "name" | "createdAt" | "updatedAt";
    sortDirection?: "asc" | "desc";
    types?: string[];
  }
) {
  const archivedFilter =
    filters.includeArchived === "true" ? {} : { isArchived: false };
  const typeFilter = filters.types?.length
    ? { type: { in: filters.types as CategoryType[] } }
    : {};
  const orderBy = categoryOrderBy(filters);

  if (filters.scope === "all") {
    return prisma.category.findMany({
      where: {
        ...archivedFilter,
        ...typeFilter,
        users: { some: { userId } },
        OR: [{ groupId: null }, { group: { members: { some: { userId } } } }]
      },
      orderBy
    });
  }

  if (filters.groupId) {
    await getGroupMembership(userId, filters.groupId);

    return prisma.category.findMany({
      where: {
        groupId: filters.groupId,
        ...archivedFilter,
        ...typeFilter,
        users: { some: { userId } }
      },
      orderBy
    });
  }

  return prisma.category.findMany({
    where: {
      groupId: null,
      ...archivedFilter,
      ...typeFilter,
      users: { some: { userId } }
    },
    orderBy
  });
}
