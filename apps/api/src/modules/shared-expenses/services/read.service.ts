import type { SharedExpenseInput } from "@flowledger/shared";
import { prisma } from "../../../db/prisma.js";
import { HttpError, notFound } from "../../../utils/httpError.js";

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

/** Lists shared expenses where `userId` is the owner or a participant, filtered/sorted per `filters`. */
export async function listSharedExpenses(
  userId: string,
  filters: {
    status?: "open" | "settled" | "cancelled";
    statuses?: ("open" | "settled" | "cancelled")[];
    sortBy?: "title" | "totalAmount" | "status" | "createdAt" | "updatedAt";
    sortDirection?: "asc" | "desc";
  } = {}
) {
  return prisma.sharedExpense.findMany({
    where: {
      OR: [
        { ownerUserId: userId },
        { participants: { some: { userId } } }
      ],
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.statuses?.length ? { status: { in: filters.statuses } } : {})
    },
    include: { transaction: true, participants: true },
    orderBy: filters.sortBy
      ? { [filters.sortBy]: filters.sortDirection ?? "asc" }
      : { createdAt: "desc" }
  });
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
