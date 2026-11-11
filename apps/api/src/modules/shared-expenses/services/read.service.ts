import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { createSieve } from "../../../db/sieve.js";
import { assertAllowedQueryFields } from "../../../db/sieveFieldGuard.js";
import { badRequest, HttpError, notFound } from "../../../utils/httpError.js";
import type {
  SharedExpenseListRecord,
  SharedExpensesQueryInput,
  SharingParticipantInput
} from "../types/sharedExpenses.types.js";
import { publicUserSelect, publicizeUsers } from "../../users/utils/publicUser.js";
import { redactGroupForNonMembers } from "../utils/groupVisibility.js";
import { withVisibleTransaction } from "../utils/transactionVisibility.js";
import { assertNoBlockedInvitees } from "../../users/services/read.service.js";

const sharedExpensesSieve = createSieve(prisma.sharedExpense);
// Participants can list these rows, so a filter on `transaction.*` would reveal the owner's private fields.
const QUERYABLE_FIELDS = new Set(["id", "title", "totalAmount", "status", "createdAt", "updatedAt"]);

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

/**
 * Precondition for creating a shared expense through the external surfaces (`/v1`, MCP): the transaction must be
 * owned by `userId` (404 otherwise, hiding foreign ids) and belong to a group (400 otherwise), so the service's
 * group-membership participant check always applies and arbitrary user ids can never be made participants.
 */
export async function assertOwnedGroupTransaction(userId: string, transactionId: string) {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
    select: { groupId: true }
  });
  if (!transaction) throw notFound("Transaction");
  if (!transaction.groupId) throw badRequest("Shared expenses can only be created for group transactions");
}

/**
 * Validates participant input for any shared transaction (Group or not): no owner, no duplicate app user, no new
 * app user blocked in either direction with the owner (400 "This user can't be invited."), every app user exists.
 * Users in `existingUserIds` skip the block check so re-saving an existing share is never refused. Returns the
 * input with `participantName` filled: `@username` snapshot for app users, `manualName` for manual ones.
 */
export async function normalizeSharedExpenseParticipants(
  ownerUserId: string,
  participants: SharingParticipantInput[] = [],
  options: {
    client?: Pick<Prisma.TransactionClient, "user" | "userBlock">;
    existingUserIds?: Set<string>;
  } = {}
) {
  const client = options.client ?? prisma;
  const userIds = participants.flatMap((participant) => (participant.userId ? [participant.userId] : []));

  if (userIds.includes(ownerUserId)) {
    throw new HttpError(400, "Shared transaction participants cannot include the owner");
  }
  if (new Set(userIds).size !== userIds.length) {
    throw new HttpError(400, "A participant can only be added once");
  }

  await assertNoBlockedInvitees(
    ownerUserId,
    userIds.filter((id) => !options.existingUserIds?.has(id)),
    client
  );

  const users = userIds.length
    ? await client.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } })
    : [];
  const usernames = new Map(users.map((user) => [user.id, user.username]));
  if (users.length !== userIds.length) {
    throw new HttpError(400, "One or more participants do not exist");
  }

  return participants.map((participant) => ({
    ...participant,
    participantName: participant.userId
      ? `@${usernames.get(participant.userId)}`
      : (participant.manualName ?? "")
  }));
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

/** Lists shared expenses where `userId` is the owner or a participant, per a DSQL query; non-owners get the public transaction fields only, with `groupId` nulled when they are not in that Group. */
export async function listSharedExpenses(
  userId: string,
  rawQuery: string | undefined
) {
  const input = parseSharedExpensesQueryParam(rawQuery);
  assertAllowedQueryFields({ where: input.where, sort: input.sort }, QUERYABLE_FIELDS);
  const visibleIds = await getVisibleSharedExpenseIds(userId);
  const scopeCondition = { field: "id", op: "in" as const, value: visibleIds };
  const where = input.where
    ? { and: [scopeCondition, input.where] }
    : scopeCondition;

  const result = await sharedExpensesSieve.query<
    SharedExpenseListRecord & { transaction?: Record<string, unknown> | null }
  >({
    where,
    sort: input.sort ?? [{ field: "createdAt", direction: "desc" }],
    include: {
      transaction: true,
      participants: { include: { user: { select: publicUserSelect } } },
      owner: { select: publicUserSelect }
    }
  });
  return redactGroupForNonMembers(
    userId,
    publicizeUsers(result.data.map((sharedExpense) => withVisibleTransaction(sharedExpense, userId)))
  );
}

/** Fetches one shared expense, throwing if it doesn't exist or `userId` is neither its owner nor a participant; non-owners get the public transaction fields only. */
export async function getSharedExpenseById(userId: string, sharedExpenseId: string) {
  const sharedExpense = await prisma.sharedExpense.findFirst({
    where: {
      id: sharedExpenseId,
      OR: [
        { ownerUserId: userId },
        { participants: { some: { userId } } }
      ]
    },
    include: {
      transaction: true,
      participants: { include: { user: { select: publicUserSelect } } },
      owner: { select: publicUserSelect }
    }
  });
  if (!sharedExpense) throw notFound("Shared expense");

  return redactGroupForNonMembers(userId, publicizeUsers(withVisibleTransaction(sharedExpense, userId)));
}
