import {
  sharedExpenseSchema,
  updateSharedExpenseSchema
} from "@flowledger/shared";
import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError, notFound } from "../../utils/httpError.js";
import { serialize } from "../../utils/serialize.js";
import {
  assertShareableTransaction,
  createSharedExpenseForTransaction,
  getOwnedTransaction,
  notifySharedExpenseParticipants,
  normalizeSharedExpenseParticipants,
  validateSharedExpenseParticipants
} from "./sharedExpenses.service.js";

export const sharedExpensesRouter = Router();

sharedExpensesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const sharedExpenses = await prisma.sharedExpense.findMany({
      where: {
        OR: [
          { ownerUserId: req.user!.id },
          { participants: { some: { userId: req.user!.id } } }
        ]
      },
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
    const transaction = await getOwnedTransaction(
      req.user!.id,
      req.body.transactionId
    );
    if (!transaction) {
      throw new HttpError(400, "Transaction is required");
    }

    const sharedExpense = await prisma.$transaction((tx) =>
      createSharedExpenseForTransaction(tx, req.user!.id, transaction, req.body)
    );

    res.status(201).json({ sharedExpense: serialize(sharedExpense) });
  })
);

sharedExpensesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const sharedExpense = await prisma.sharedExpense.findFirst({
      where: {
        id: req.params.id,
        OR: [
          { ownerUserId: req.user!.id },
          { participants: { some: { userId: req.user!.id } } }
        ]
      },
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
      where: { id: req.params.id, ownerUserId: req.user!.id },
      include: { transaction: true, participants: true }
    });
    if (!existing) throw notFound("Shared expense");

    const transaction = await getOwnedTransaction(
      req.user!.id,
      req.body.transactionId
    );
    if (transaction) {
      assertShareableTransaction(transaction);
    }

    const { participants, ...input } = req.body;
    const normalizedParticipants = participants
      ? await normalizeSharedExpenseParticipants(
          req.user!.id,
          participants,
          transaction?.groupId ?? existing.transaction.groupId
        )
      : undefined;

    if (normalizedParticipants) {
      validateSharedExpenseParticipants(
        transaction?.amount ?? existing.totalAmount,
        normalizedParticipants
      );
    }

    const existingUserIds = new Set(
      existing.participants
        .map((participant) => participant.userId)
        .filter((userId): userId is string => Boolean(userId))
    );
    const addedUserIds = new Set(
      normalizedParticipants
        ?.map((participant) => participant.userId)
        .filter((userId): userId is string => Boolean(userId))
        .filter((userId) => !existingUserIds.has(userId)) ?? []
    );

    const sharedExpense = await prisma.$transaction(async (tx) => {
      const updated = await tx.sharedExpense.update({
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

      if (addedUserIds.size > 0) {
        await notifySharedExpenseParticipants(
          tx,
          req.user!.id,
          updated,
          updated.participants.filter(
            (participant) =>
              participant.userId && addedUserIds.has(participant.userId)
          )
        );
      }

      return updated;
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
