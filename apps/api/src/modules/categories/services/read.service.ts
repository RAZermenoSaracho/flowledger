import type { CategoryType, Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { getGroupMembership } from "../../groups/services/read.service.js";

function categoryOrderBy(filters: {
  sortBy?: "name" | "createdAt" | "updatedAt";
  sortDirection?: "asc" | "desc";
}): Prisma.CategoryOrderByWithRelationInput[] {
  if (filters.sortBy) {
    return [{ [filters.sortBy]: filters.sortDirection ?? "asc" }];
  }

  return [{ type: "asc" }, { name: "asc" }];
}

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
