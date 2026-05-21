import { transactionFiltersSchema, transactionSchema, updateTransactionSchema } from "@flowledger/shared";
import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { validate } from "../../middleware/validate.js";
import {
  assertHouseholdCategory,
  getHouseholdMembership
} from "../households/households.service.js";
import { createSharedExpenseForTransaction } from "../shared-expenses/sharedExpenses.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError, notFound } from "../../utils/httpError.js";
import { serialize } from "../../utils/serialize.js";

export const transactionsRouter = Router();

async function assertOwnedRelations(userId: string, input: { accountId?: string | null; categoryId?: string | null }) {
  if (input.accountId) {
    const account = await prisma.account.findFirst({ where: { id: input.accountId, userId } });
    if (!account) throw new HttpError(400, "Account does not exist for this user");
  }

  if (input.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, userId } });
    if (!category) throw new HttpError(400, "Category does not exist for this user");
  }
}

async function assertHouseholdRelations(
  userId: string,
  input: { householdId?: string | null; householdCategoryId?: string | null }
) {
  if (input.householdId) {
    await getHouseholdMembership(userId, input.householdId);
  }

  await assertHouseholdCategory(userId, input.householdId, input.householdCategoryId);
}

transactionsRouter.get(
  "/",
  validate(transactionFiltersSchema, "query"),
  asyncHandler(async (req, res) => {
    const filters = req.query as {
      dateFrom?: string;
      dateTo?: string;
      categoryId?: string;
      householdId?: string;
      householdCategoryId?: string;
      accountId?: string;
      type?: "income" | "expense" | "transfer";
      search?: string;
    };

    const where: Prisma.TransactionWhereInput = {
      userId: req.user!.id,
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.householdId ? { householdId: filters.householdId } : {}),
      ...(filters.householdCategoryId
        ? { householdCategoryId: filters.householdCategoryId }
        : {}),
      ...(filters.accountId ? { accountId: filters.accountId } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" } },
              { notes: { contains: filters.search, mode: "insensitive" } }
            ]
          }
        : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            date: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
              ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {})
            }
          }
        : {})
    };

    const transactions = await prisma.transaction.findMany({
      where,
      include: { account: true, category: true, household: true, householdCategory: true },
      orderBy: { date: "desc" }
    });

    res.json({ transactions: serialize(transactions) });
  })
);

transactionsRouter.post(
  "/",
  validate(transactionSchema),
  asyncHandler(async (req, res) => {
    await assertOwnedRelations(req.user!.id, req.body);
    await assertHouseholdRelations(req.user!.id, req.body);

    const { sharedExpense, ...input } = req.body;
    const transaction = await prisma.$transaction(async (tx) => {
      const createdTransaction = await tx.transaction.create({
        data: { ...input, userId: req.user!.id, date: new Date(input.date) },
        include: { account: true, category: true }
      });

      if (sharedExpense) {
        await createSharedExpenseForTransaction(tx, req.user!.id, createdTransaction, {
          ...sharedExpense,
          status: "open"
        });
      }

      return tx.transaction.findUniqueOrThrow({
        where: { id: createdTransaction.id },
        include: {
          account: true,
          category: true,
          household: true,
          householdCategory: true,
          sharedExpense: { include: { participants: true } }
        }
      });
    });

    res.status(201).json({ transaction: serialize(transaction) });
  })
);

transactionsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const transaction = await prisma.transaction.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      include: {
        account: true,
        category: true,
        household: true,
        householdCategory: true,
        relations: { include: { relatedTransaction: true } },
        relatedBy: { include: { transaction: true } },
        sharedExpense: { include: { participants: true } }
      }
    });

    if (!transaction) throw notFound("Transaction");
    res.json({ transaction: serialize(transaction) });
  })
);

transactionsRouter.put(
  "/:id",
  validate(updateTransactionSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.transaction.findFirst({
      where: { id: req.params.id, userId: req.user!.id }
    });
    if (!existing) throw notFound("Transaction");

    await assertOwnedRelations(req.user!.id, req.body);
    await assertHouseholdRelations(req.user!.id, {
      householdId:
        req.body.householdId !== undefined ? req.body.householdId : existing.householdId,
      householdCategoryId:
        req.body.householdCategoryId !== undefined
          ? req.body.householdCategoryId
          : existing.householdCategoryId
    });

    const transaction = await prisma.$transaction(async (tx) => {
      const updatedTransaction = await tx.transaction.update({
        where: { id: existing.id },
        data: {
          ...req.body,
          ...(req.body.date ? { date: new Date(req.body.date) } : {})
        },
        include: { account: true, category: true, household: true, householdCategory: true }
      });

      if (req.body.amount !== undefined) {
        await tx.sharedExpense.updateMany({
          where: { transactionId: existing.id },
          data: { totalAmount: updatedTransaction.amount }
        });
      }

      return updatedTransaction;
    });

    res.json({ transaction: serialize(transaction) });
  })
);

transactionsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.transaction.findFirst({
      where: { id: req.params.id, userId: req.user!.id }
    });
    if (!existing) throw notFound("Transaction");

    await prisma.transaction.delete({ where: { id: existing.id } });
    res.status(204).send();
  })
);
