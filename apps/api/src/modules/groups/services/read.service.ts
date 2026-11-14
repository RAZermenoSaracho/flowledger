import { Prisma } from "@prisma/client";
import { getExchangeRate } from "../../currencies/services/read.service.js";
import { valueInCurrency } from "../../currencies/utils/valuation.js";
import { prisma } from "../../../db/prisma.js";
import { createSieve } from "../../../db/sieve.js";
import { HttpError, notFound } from "../../../utils/httpError.js";
import { parseQueryParam } from "../../../utils/parseQueryParam.js";
import type { GroupListRecord, GroupsQueryInput } from "../types/groups.types.js";
import { publicizeUsers } from "../../users/utils/publicUser.js";
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

/** Lists groups `userId` belongs to, per a DSQL query. */
export async function listGroups(userId: string, rawQuery: string | undefined) {
  const input = parseQueryParam<GroupsQueryInput>(rawQuery, "groups");
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
  return publicizeUsers(result.data);
}

/** Alias of `getGroupById` for the external surfaces (/v1, MCP); both answer a non-member or missing group with 404. */
export const getMemberGroup = (userId: string, groupId: string) => getGroupById(userId, groupId);

/** Fetches one group (its active categories/members) plus its 25 most recent transactions and an income/expense summary for `userId`; requires `userId` to be a member; a non-member or missing group is a 404 so existence doesn't leak. */
export async function getGroupById(userId: string, groupId: string) {
  const member = await prisma.groupMember.findFirst({ where: { groupId, userId }, select: { id: true } });
  if (!member) throw notFound("Group");

  const [group, transactionTotals, viewer] = await Promise.all([
    prisma.group.findUnique({
      where: { id: groupId },
      include: {
        ...groupInclude(userId),
        transactions: {
          where: { userId },
          include: {
            account: true,
            category: true,
            providerImportedTransaction: { select: { transactionDate: true } }
          },
          orderBy: { date: "desc" },
          take: 25
        }
      }
    }),
    prisma.transaction.groupBy({
      by: ["type", "executionCurrency"],
      where: {
        userId,
        groupId,
        type: { in: ["income", "expense"] }
      },
      _sum: { amount: true }
    }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { preferredCurrency: true } })
  ]);

  if (!group) throw notFound("Group");

  const currency = viewer.preferredCurrency ?? "USD";
  const totals = { income: new Prisma.Decimal(0), expense: new Prisma.Decimal(0) };
  for (const row of transactionTotals) {
    if (row.type !== "income" && row.type !== "expense") continue;
    const rate = await getExchangeRate(row.executionCurrency, currency);
    totals[row.type] = totals[row.type].plus(valueInCurrency(row._sum.amount ?? 0, rate, currency));
  }
  const summary = { totalIncome: totals.income.toNumber(), totalExpenses: totals.expense.toNumber() };

  return {
    ...publicizeUsers(group),
    summary: {
      ...summary,
      currency,
      balance: totals.income.minus(totals.expense).toNumber()
    }
  };
}
