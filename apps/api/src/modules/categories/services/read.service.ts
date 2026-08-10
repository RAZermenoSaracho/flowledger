import { prisma } from "../../../db/prisma.js";
import { createSieve } from "../../../db/sieve.js";
import { badRequest, notFound } from "../../../utils/httpError.js";
import { getGroupAdmin, getGroupMembership } from "../../groups/services/read.service.js";
import type {
  CategoriesQueryInput,
  CategoryListRecord
} from "../types/categories.types.js";

const categoriesSieve = createSieve(prisma.category);

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

// DSQL can't express `users: { some: { userId } }` (a to-many relation
// filtered by a nested condition — see @razsdev/datasieve-prisma's
// translate/where.ts "known limitations"), which is how category
// visibility/ownership is actually enforced (join-table membership, not a
// column on Category itself). So visibility is resolved here, once, via a
// narrow raw-Prisma id lookup, then folded into the DSQL `where` as an
// ordinary `id in` condition — same pattern transactions uses for its one
// unsupported case (see transactions/services/read.service.ts).
async function getVisibleCategoryIds(
  userId: string,
  scope: { groupId?: string; scope?: "all" }
) {
  if (scope.scope === "all") {
    const rows = await prisma.category.findMany({
      where: {
        users: { some: { userId } },
        OR: [{ groupId: null }, { group: { members: { some: { userId } } } }]
      },
      select: { id: true }
    });
    return rows.map((row) => row.id);
  }

  if (scope.groupId) {
    await getGroupMembership(userId, scope.groupId);
    const rows = await prisma.category.findMany({
      where: { groupId: scope.groupId, users: { some: { userId } } },
      select: { id: true }
    });
    return rows.map((row) => row.id);
  }

  const rows = await prisma.category.findMany({
    where: { groupId: null, users: { some: { userId } } },
    select: { id: true }
  });
  return rows.map((row) => row.id);
}

function parseCategoriesQueryParam(raw: string | undefined) {
  if (!raw) return {} as CategoriesQueryInput;

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw badRequest("Invalid categories query: not valid JSON");
  }

  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
    throw badRequest("Invalid categories query: must be a JSON object");
  }

  return decoded as CategoriesQueryInput;
}

/** Lists categories visible to `userId` for the given scope (all/group/personal), per a DSQL query within that scope. */
export async function listCategories(
  userId: string,
  scope: { groupId?: string; scope?: "all" },
  rawQuery: string | undefined
) {
  const input = parseCategoriesQueryParam(rawQuery);
  const visibleIds = await getVisibleCategoryIds(userId, scope);
  const scopeCondition = { field: "id", op: "in" as const, value: visibleIds };
  const where = input.where
    ? { and: [scopeCondition, input.where] }
    : scopeCondition;

  const result = await categoriesSieve.query<CategoryListRecord>({
    where,
    sort: input.sort ?? [
      { field: "type", direction: "asc" },
      { field: "name", direction: "asc" }
    ]
  });
  return result.data;
}
