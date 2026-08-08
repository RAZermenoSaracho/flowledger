import { prisma } from "../../../db/prisma.js";
import { HttpError, notFound } from "../../../utils/httpError.js";
import { groupInclude } from "../utils/groupInclude.js";

/** Looks up `userId`'s membership row for `groupId`, or `null` if `groupId` is not given; throws if given but the user isn't a member. */
export async function getGroupMembership(
  userId: string,
  groupId?: string | null
) {
  if (!groupId) return null;

  const member = await prisma.groupMember.findFirst({
    where: { groupId, userId }
  });

  if (!member) {
    throw new HttpError(400, "Group does not exist for this user");
  }

  return member;
}

/** Throws (404, to avoid leaking group existence) unless `userId` is an admin member of `groupId`. */
export async function getGroupAdmin(userId: string, groupId: string) {
  const member = await prisma.groupMember.findFirst({
    where: { groupId, userId, role: "admin" }
  });

  if (!member) {
    throw new HttpError(404, "Group not found");
  }

  return member;
}

/** Throws unless `categoryId` is an active category of `groupId` that `userId` (a group member) has access to; returns `null` if no `categoryId` is given. */
export async function assertCategory(
  userId: string,
  groupId?: string | null,
  categoryId?: string | null
) {
  if (!categoryId) return null;
  if (!groupId) {
    throw new HttpError(400, "Group category requires a group");
  }

  await getGroupMembership(userId, groupId);

  const category = await prisma.category.findFirst({
    where: {
      id: categoryId,
      groupId,
      isArchived: false,
      group: { isArchived: false },
      users: { some: { userId } }
    }
  });

  if (!category) {
    throw new HttpError(400, "Group category does not exist or is archived");
  }

  return category;
}

/** Lists groups `userId` belongs to, with optional archive-inclusion and sort filters. */
export async function listGroups(
  userId: string,
  filters: {
    includeArchived?: string;
    sortBy?: "name" | "createdAt" | "updatedAt";
    sortDirection?: "asc" | "desc";
  }
) {
  return prisma.group.findMany({
    where: {
      members: { some: { userId } },
      ...(filters.includeArchived === "true" ? {} : { isArchived: false })
    },
    include: groupInclude(userId),
    orderBy: filters.sortBy
      ? { [filters.sortBy]: filters.sortDirection ?? "asc" }
      : { createdAt: "desc" }
  });
}

/** Fetches one group (categories/members filtered per params) plus its 25 most recent transactions and an income/expense summary for `userId`; requires `userId` to be a member. */
export async function getGroupById(
  userId: string,
  groupId: string,
  includeArchivedCategories: boolean,
  categorySort?: {
    sortBy?: "name" | "createdAt" | "updatedAt";
    sortDirection?: "asc" | "desc";
  },
  categoryTypes?: string[]
) {
  await getGroupMembership(userId, groupId);

  const [group, transactionTotals] = await Promise.all([
    prisma.group.findUnique({
      where: { id: groupId },
      include: {
        ...groupInclude(
          userId,
          includeArchivedCategories,
          categorySort,
          categoryTypes
        ),
        transactions: {
          where: { userId },
          include: { account: true, category: true },
          orderBy: { date: "desc" },
          take: 25
        }
      }
    }),
    prisma.transaction.groupBy({
      by: ["type"],
      where: {
        userId,
        groupId,
        type: { in: ["income", "expense"] }
      },
      _sum: { amount: true }
    })
  ]);

  if (!group) throw notFound("Group");

  const summary = transactionTotals.reduce(
    (totals, row) => {
      const amount = row._sum.amount?.toNumber() ?? 0;
      if (row.type === "income") totals.totalIncome += amount;
      if (row.type === "expense") totals.totalExpenses += amount;
      return totals;
    },
    { totalIncome: 0, totalExpenses: 0 }
  );

  return {
    ...group,
    summary: {
      ...summary,
      balance: summary.totalIncome - summary.totalExpenses
    }
  };
}
