import type { SharedExpenseInput } from "@flowledger/shared";
import type { Prisma, Transaction } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { createNotifications, moneyText } from "../notifications/notifications.service.js";
import { getDebtDirection } from "../debts/debtDirection.js";

type ParticipantInput = NonNullable<SharedExpenseInput["participants"]>[number];

function totalParticipantShares(participants: ParticipantInput[]) {
  return participants.reduce((sum, participant) => sum + Number(participant.shareAmount), 0);
}

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

export async function normalizeSharedExpenseParticipants(
  ownerUserId: string,
  participants: SharedExpenseInput["participants"] = [],
  householdId?: string | null
) {
  const participantUserIds = Array.from(
    new Set(participants.map((participant) => participant.userId).filter(Boolean))
  ) as string[];

  if (participantUserIds.includes(ownerUserId)) {
    throw new HttpError(400, "Shared expense participants cannot include the owner");
  }

  if (householdId && participants.some((participant) => !participant.userId)) {
    throw new HttpError(400, "Household split participants must be app users");
  }

  if (participantUserIds.length === 0) {
    return participants;
  }

  if (householdId) {
    const householdMemberCount = await prisma.householdMember.count({
      where: {
        householdId,
        userId: { in: participantUserIds }
      }
    });

    if (householdMemberCount !== participantUserIds.length) {
      throw new HttpError(400, "Household split participants must be household members");
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

export function validateSharedExpenseParticipants(
  totalAmount: Prisma.Decimal,
  participants: ParticipantInput[]
) {
  if (totalParticipantShares(participants) > totalAmount.toNumber()) {
    throw new HttpError(400, "Participant shares cannot exceed the transaction amount");
  }
}

export async function createSharedExpenseForTransaction(
  tx: Prisma.TransactionClient,
  ownerUserId: string,
  transaction: Pick<Transaction, "id" | "amount" | "name" | "householdId">,
  input: Omit<SharedExpenseInput, "transactionId"> & { transactionId?: string }
) {
  const participants = await normalizeSharedExpenseParticipants(
    ownerUserId,
    input.participants,
    transaction.householdId
  );
  validateSharedExpenseParticipants(transaction.amount, participants);

  const sharedExpense = await tx.sharedExpense.create({
    data: {
      transactionId: transaction.id,
      title: input.title || transaction.name,
      status: input.status,
      totalAmount: transaction.amount,
      ownerUserId,
      participants: { create: participants }
    },
    include: { transaction: true, participants: true }
  });

  await notifySharedExpenseParticipants(tx, ownerUserId, sharedExpense, sharedExpense.participants);

  return sharedExpense;
}

export async function notifySharedExpenseParticipants(
  tx: Prisma.TransactionClient,
  ownerUserId: string,
  sharedExpense: {
    id: string;
    title: string;
    transactionId: string;
    transaction: { type: "income" | "expense" | "transfer" };
  },
  participants: {
    id: string;
    userId: string | null;
    participantName: string;
    shareAmount: Prisma.Decimal;
  }[]
) {
  const notifications = participants.flatMap((participant) => {
    if (!participant.userId) return [];

    const direction = getDebtDirection({
      userId: participant.userId,
      sharedExpense: {
        ownerUserId,
        transaction: sharedExpense.transaction
      }
    });

    const metadata = {
      sharedExpenseId: sharedExpense.id,
      transactionId: sharedExpense.transactionId,
      participantId: participant.id
    };
    const base = [
      {
        userId: participant.userId,
        type: "shared_expense_added" as const,
        title: "Added to shared expense",
        message: `You were added to ${sharedExpense.title}.`,
        metadata
      }
    ];

    if (!direction?.debtorUserId || !direction.creditorUserId) {
      return base;
    }

    const amount = moneyText(participant.shareAmount);
    return [
      ...base,
      {
        userId: direction.debtorUserId,
        type: "debt_owes_money" as const,
        title: "You owe money",
        message:
          direction.debtorUserId === participant.userId
            ? `You owe ${amount} for ${sharedExpense.title}.`
            : `You owe ${participant.participantName} ${amount} for ${sharedExpense.title}.`,
        metadata
      },
      {
        userId: direction.creditorUserId,
        type: "debt_owed_money" as const,
        title: "You are owed money",
        message:
          direction.creditorUserId === participant.userId
            ? `You are owed ${amount} for ${sharedExpense.title}.`
            : `${participant.participantName} owes you ${amount} for ${sharedExpense.title}.`,
        metadata
      }
    ];
  });

  await createNotifications(tx, notifications);
}
