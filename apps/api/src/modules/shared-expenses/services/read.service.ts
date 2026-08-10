import type { SharedExpenseInput } from "@flowledger/shared";
import { prisma } from "../../../db/prisma.js";
import { createSieve } from "../../../db/sieve.js";
import { badRequest, HttpError, notFound } from "../../../utils/httpError.js";
import type {
  SharedExpenseListRecord,
  SharedExpensesQueryInput
} from "../types/sharedExpenses.types.js";

const sharedExpensesSieve = createSieve(prisma.sharedExpense);

/** Fetches a transaction owned by `userId`, or `null` if no `transactionId` was given; throws if `transactionId` was given but doesn't resolve. */
export async function getOwnedTransaction(userId: string, transactionId?: string) {
  if (!transactionId) return null;

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId }
  });

  if (!transaction) {
    throw new HttpError(400, "Transaction does not exist for this user");
  }

  return transaction;
}

/** Validates participant input (no owner, group-split participants must be app users and group members) and fills in each registered participant's current display name. */
export async function normalizeSharedExpenseParticipants(
  ownerUserId: string,
  participants: SharedExpenseInput["participants"] = [],
  groupId?: string | null
) {
  const participantUserIds = Array.from(
    new Set(
      participants.map((participant) => participant.userId).filter(Boolean)
    )
  ) as string[];

  if (participantUserIds.includes(ownerUserId)) {
    throw new HttpError(
      400,
      "Shared transaction participants cannot include the owner"
    );
  }

  if (groupId && participants.some((participant) => !participant.userId)) {
    throw new HttpError(400, "Group split participants must be app users");
  }

  if (participantUserIds.length === 0) {
    return participants;
  }

  if (groupId) {
    const groupMemberCount = await prisma.groupMember.count({
      where: {
        groupId,
        userId: { in: participantUserIds }
      }
    });

    if (groupMemberCount !== participantUserIds.length) {
      throw new HttpError(
        400,
        "Group split participants must be group members"
      );
    }
  }

  const users = await prisma.user.findMany({
    where: { id: { in: participantUserIds } },
    select: { id: true, name: true }
  });
  const usersById = new Map(users.map((user) => [user.id, user]));

  if (users.length !== participantUserIds.length) {
    throw new HttpError(400, "One or more participants do not exist");
  }

  return participants.map((participant) => {
    if (!participant.userId) return participant;

    const user = usersById.get(participant.userId);
    return {
      ...participant,
      participantName: user?.name ?? participant.participantName
    };
  });
}

// DSQL can't express `participants: { some: { userId } }` (a to-many
// relation filtered by a nested condition — see categories/services/
// read.service.ts's identical comment). Visibility is resolved here, once,
// via a narrow raw-Prisma id lookup (the owner half of the OR is a plain
// scalar equality and could run through DSQL fine on its own, but since
// it's OR'd with the relation half, the whole check is precomputed
// together), then folded into the DSQL `where` as an ordinary `id in`
// condition.
async function getVisibleSharedExpenseIds(userId: string) {
  const rows = await prisma.sharedExpense.findMany({
    where: {
      OR: [{ ownerUserId: userId }, { participants: { some: { userId } } }]
    },
    select: { id: true }
  });
  return rows.map((row) => row.id);
}

function parseSharedExpensesQueryParam(raw: string | undefined) {
  if (!raw) return {} as SharedExpensesQueryInput;

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw badRequest("Invalid shared-expenses query: not valid JSON");
  }

  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
    throw badRequest("Invalid shared-expenses query: must be a JSON object");
  }

  return decoded as SharedExpensesQueryInput;
}

/** Lists shared expenses where `userId` is the owner or a participant, per a DSQL query. */
export async function listSharedExpenses(
  userId: string,
  rawQuery: string | undefined
) {
  const input = parseSharedExpensesQueryParam(rawQuery);
  const visibleIds = await getVisibleSharedExpenseIds(userId);
  const scopeCondition = { field: "id", op: "in" as const, value: visibleIds };
  const where = input.where
    ? { and: [scopeCondition, input.where] }
    : scopeCondition;

  const result = await sharedExpensesSieve.query<SharedExpenseListRecord>({
    where,
    sort: input.sort ?? [{ field: "createdAt", direction: "desc" }],
    include: { transaction: true, participants: true }
  });
  return result.data;
}

/** Fetches one shared expense, throwing if it doesn't exist or `userId` is neither its owner nor a participant. */
export async function getSharedExpenseById(userId: string, sharedExpenseId: string) {
  const sharedExpense = await prisma.sharedExpense.findFirst({
    where: {
      id: sharedExpenseId,
      OR: [
        { ownerUserId: userId },
        { participants: { some: { userId } } }
      ]
    },
    include: { transaction: true, participants: true }
  });
  if (!sharedExpense) throw notFound("Shared expense");

  return sharedExpense;
}
