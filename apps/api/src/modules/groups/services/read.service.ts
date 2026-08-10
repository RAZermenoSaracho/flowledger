import { prisma } from "../../../db/prisma.js";
import { createSieve } from "../../../db/sieve.js";
import { badRequest, HttpError, notFound } from "../../../utils/httpError.js";
import type { GroupListRecord, GroupsQueryInput } from "../types/groups.types.js";
import { groupInclude, groupListInclude } from "../utils/groupInclude.js";

const groupsSieve = createSieve(prisma.group);

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

// DSQL can't express `members: { some: { userId } }` (a to-many relation
// filtered by a nested condition — see categories/services/read.service.ts's
// identical comment for the pattern this follows). Membership is resolved
// here, once, via a narrow raw-Prisma id lookup, then folded into the DSQL
// `where` as an ordinary `id in` condition.
async function getVisibleGroupIds(userId: string) {
  const rows = await prisma.group.findMany({
    where: { members: { some: { userId } } },
    select: { id: true }
  });
  return rows.map((row) => row.id);
}

function parseGroupsQueryParam(raw: string | undefined) {
  if (!raw) return {} as GroupsQueryInput;

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw badRequest("Invalid groups query: not valid JSON");
  }

  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
    throw badRequest("Invalid groups query: must be a JSON object");
  }

  return decoded as GroupsQueryInput;
}

/** Lists groups `userId` belongs to, per a DSQL query. */
export async function listGroups(userId: string, rawQuery: string | undefined) {
  const input = parseGroupsQueryParam(rawQuery);
  const visibleIds = await getVisibleGroupIds(userId);
  const scopeCondition = { field: "id", op: "in" as const, value: visibleIds };
  const where = input.where
    ? { and: [scopeCondition, input.where] }
    : scopeCondition;

  const result = await groupsSieve.query<GroupListRecord>({
    where,
    sort: input.sort ?? [{ field: "createdAt", direction: "desc" }],
    include: groupListInclude()
  });
  return result.data;
}

/** Fetches one group (its active categories/members) plus its 25 most recent transactions and an income/expense summary for `userId`; requires `userId` to be a member. */
export async function getGroupById(userId: string, groupId: string) {
  await getGroupMembership(userId, groupId);

  const [group, transactionTotals] = await Promise.all([
    prisma.group.findUnique({
      where: { id: groupId },
      include: {
        ...groupInclude(userId),
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
