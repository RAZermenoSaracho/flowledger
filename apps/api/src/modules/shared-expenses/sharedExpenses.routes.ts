import { sharedExpenseSchema, updateSharedExpenseSchema } from "@flowledger/shared";
import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError, notFound } from "../../utils/httpError.js";
import { serialize } from "../../utils/serialize.js";

export const sharedExpensesRouter = Router();

async function assertOwnedTransaction(userId: string, transactionId?: string) {
  if (!transactionId) return;

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId }
  });

  if (!transaction) {
    throw new HttpError(400, "Transaction does not exist for this user");
  }
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
    await assertOwnedTransaction(req.user!.id, req.body.transactionId);

    const { participants = [], ...input } = req.body;
    const sharedExpense = await prisma.sharedExpense.create({
      data: {
        ...input,
        ownerUserId: req.user!.id,
        participants: { create: participants }
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

    await assertOwnedTransaction(req.user!.id, req.body.transactionId);

    const { participants, ...input } = req.body;
    const sharedExpense = await prisma.sharedExpense.update({
      where: { id: existing.id },
      data: {
        ...input,
        ...(participants
          ? {
              participants: {
                deleteMany: {},
                create: participants
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
