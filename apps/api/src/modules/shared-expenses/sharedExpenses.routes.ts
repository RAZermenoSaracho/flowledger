import { sharedExpenseSchema, updateSharedExpenseSchema } from "@flowledger/shared";
import type { SharedExpenseInput } from "@flowledger/shared";
import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError, notFound } from "../../utils/httpError.js";
import { serialize } from "../../utils/serialize.js";

export const sharedExpensesRouter = Router();

async function getOwnedTransaction(userId: string, transactionId?: string) {
  if (!transactionId) return null;

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId }
  });

  if (!transaction) {
    throw new HttpError(400, "Transaction does not exist for this user");
  }

  return transaction;
}

async function normalizeParticipants(
  ownerUserId: string,
  participants: SharedExpenseInput["participants"] = []
) {
  const participantUserIds = Array.from(
    new Set(participants.map((participant) => participant.userId).filter(Boolean))
  ) as string[];

  if (participantUserIds.includes(ownerUserId)) {
    throw new HttpError(400, "Shared expense participants cannot include the owner");
  }

  if (participantUserIds.length === 0) {
    return participants;
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

sharedExpensesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const sharedExpenses = await prisma.sharedExpense.findMany({
      where: { ownerUserId: req.user!.id },
      include: { transaction: true, participants: true },
      orderBy: { createdAt: "desc" }
    });
    res.json({ sharedExpenses: serialize(sharedExpenses) });
  })
);

sharedExpensesRouter.post(
  "/",
  validate(sharedExpenseSchema),
  asyncHandler(async (req, res) => {
    const transaction = await getOwnedTransaction(req.user!.id, req.body.transactionId);
    if (!transaction) {
      throw new HttpError(400, "Transaction is required");
    }

    const { participants = [], ...input } = req.body;
    const normalizedParticipants = await normalizeParticipants(req.user!.id, participants);
    const sharedExpense = await prisma.sharedExpense.create({
      data: {
        ...input,
        totalAmount: transaction.amount,
        ownerUserId: req.user!.id,
        participants: { create: normalizedParticipants }
      },
      include: { transaction: true, participants: true }
    });

    res.status(201).json({ sharedExpense: serialize(sharedExpense) });
  })
);

sharedExpensesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const sharedExpense = await prisma.sharedExpense.findFirst({
      where: { id: req.params.id, ownerUserId: req.user!.id },
      include: { transaction: true, participants: true }
    });
    if (!sharedExpense) throw notFound("Shared expense");

    res.json({ sharedExpense: serialize(sharedExpense) });
  })
);

sharedExpensesRouter.put(
  "/:id",
  validate(updateSharedExpenseSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.sharedExpense.findFirst({
      where: { id: req.params.id, ownerUserId: req.user!.id }
    });
    if (!existing) throw notFound("Shared expense");

    const transaction = await getOwnedTransaction(req.user!.id, req.body.transactionId);

    const { participants, ...input } = req.body;
    const normalizedParticipants = participants
      ? await normalizeParticipants(req.user!.id, participants)
      : undefined;
    const sharedExpense = await prisma.sharedExpense.update({
      where: { id: existing.id },
      data: {
        ...input,
        ...(transaction ? { totalAmount: transaction.amount } : {}),
        ...(normalizedParticipants
          ? {
              participants: {
                deleteMany: {},
                create: normalizedParticipants
              }
            }
          : {})
      },
      include: { transaction: true, participants: true }
    });

    res.json({ sharedExpense: serialize(sharedExpense) });
  })
);

sharedExpensesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.sharedExpense.findFirst({
      where: { id: req.params.id, ownerUserId: req.user!.id }
    });
    if (!existing) throw notFound("Shared expense");

    await prisma.sharedExpense.delete({ where: { id: existing.id } });
    res.status(204).send();
  })
);
