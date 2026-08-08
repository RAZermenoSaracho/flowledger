import type { SharedExpenseInput } from "@flowledger/shared";
import type { Prisma, Transaction } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { HttpError } from "../../../utils/httpError.js";
import { createNotifications } from "../../notifications/services/create.service.js";
import { moneyText } from "../../notifications/utils/moneyText.js";
import { getDebtDirection } from "../../debts/utils/debtDirection.js";
import { assertShareableTransaction, validateSharedExpenseParticipants } from "../utils/assertions.js";
import { getOwnedTransaction, normalizeSharedExpenseParticipants } from "./read.service.js";

/** Creates a shared-expense record and its participants for a transaction just created inside `tx`, then notifies participants; used inline during transaction creation rather than as a standalone endpoint. */
export async function createSharedExpenseForTransaction(
  tx: Prisma.TransactionClient,
  ownerUserId: string,
  transaction: Pick<
    Transaction,
    "id" | "amount" | "name" | "groupId" | "type" | "executionCurrency"
  >,
  input: Omit<SharedExpenseInput, "transactionId"> & { transactionId?: string }
) {
  assertShareableTransaction(transaction);

  const participants = await normalizeSharedExpenseParticipants(
    ownerUserId,
    input.participants,
    transaction.groupId
  );
  validateSharedExpenseParticipants(transaction.amount, participants);

  const sharedExpense = await tx.sharedExpense.create({
    data: {
      transactionId: transaction.id,
      title: input.title || transaction.name,
      status: input.status,
      totalAmount: transaction.amount,
      ownerUserId,
      participants: {
        create: participants.map((participant) => ({
          ...participant,
          currency: transaction.executionCurrency
        }))
      }
    },
    include: { transaction: true, participants: true }
  });

  await notifySharedExpenseParticipants(
    tx,
    ownerUserId,
    sharedExpense,
    sharedExpense.participants
  );

  return sharedExpense;
}

/** Notifies each participant they were added, plus a debt-owed/owed-to notification for whichever side of the transaction they're on. */
export async function notifySharedExpenseParticipants(
  tx: Prisma.TransactionClient,
  ownerUserId: string,
  sharedExpense: {
    id: string;
    title: string;
    transactionId: string;
    transaction: {
      type: "income" | "expense" | "transfer";
      groupId?: string | null;
    };
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
      participantId: participant.id,
      ...(sharedExpense.transaction.groupId
        ? { groupId: sharedExpense.transaction.groupId }
        : {})
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

/** Validates the target transaction belongs to `userId`, then creates a shared expense with participants in one transaction. */
export async function createSharedExpense(
  userId: string,
  input: SharedExpenseInput
) {
  const transaction = await getOwnedTransaction(userId, input.transactionId);
  if (!transaction) {
    throw new HttpError(400, "Transaction is required");
  }

  return prisma.$transaction((tx) =>
    createSharedExpenseForTransaction(tx, userId, transaction, input)
  );
}
