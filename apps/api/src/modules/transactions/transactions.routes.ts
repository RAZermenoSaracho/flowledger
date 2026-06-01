import {
  transactionFiltersSchema,
  transactionSchema,
  updateTransactionSchema
} from "@flowledger/shared";
import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { validate } from "../../middleware/validate.js";
import {
  assertCategory,
  getGroupMembership
} from "../groups/groups.service.js";
import { createSharedExpenseForTransaction } from "../shared-expenses/sharedExpenses.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError, notFound } from "../../utils/httpError.js";
import { serialize } from "../../utils/serialize.js";

export const transactionsRouter = Router();

async function assertOwnedRelations(
  userId: string,
  input: {
    accountId?: string | null;
    transferToAccountId?: string | null;
    categoryId?: string | null;
    expenseOffsetCategoryId?: string | null;
    groupId?: string | null;
  }
) {
  if (input.accountId) {
    const account = await prisma.account.findFirst({
      where: { id: input.accountId, userId, isArchived: false }
    });
    if (!account)
      throw new HttpError(400, "Account does not exist or is archived");
  }

  if (input.transferToAccountId) {
    const account = await prisma.account.findFirst({
      where: { id: input.transferToAccountId, userId, isArchived: false }
    });
    if (!account) {
      throw new HttpError(
        400,
        "Destination account does not exist or is archived"
      );
    }
  }

  if (input.categoryId && !input.groupId) {
    const category = await prisma.category.findFirst({
      where: {
        id: input.categoryId,
        groupId: null,
        isArchived: false,
        users: { some: { userId } }
      }
    });
    if (!category)
      throw new HttpError(400, "Category does not exist or is archived");
  }

  if (input.expenseOffsetCategoryId && !input.groupId) {
    const category = await prisma.category.findFirst({
      where: {
        id: input.expenseOffsetCategoryId,
        type: "expense",
        groupId: null,
        isArchived: false,
        users: { some: { userId } }
      }
    });
    if (!category) {
      throw new HttpError(
        400,
        "Expense offset category does not exist or is archived"
      );
    }
  }
}

async function assertGroupRelations(
  userId: string,
  input: {
    groupId?: string | null;
    categoryId?: string | null;
    expenseOffsetCategoryId?: string | null;
  }
) {
  if (input.groupId) {
    await getGroupMembership(userId, input.groupId);
    const group = await prisma.group.findFirst({
      where: { id: input.groupId, isArchived: false }
    });
    if (!group) throw new HttpError(400, "Group does not exist or is archived");
  }

  if (input.groupId) {
    await assertCategory(userId, input.groupId, input.categoryId);

    if (input.expenseOffsetCategoryId) {
      const category = await prisma.category.findFirst({
        where: {
          id: input.expenseOffsetCategoryId,
          type: "expense",
          groupId: input.groupId,
          isArchived: false,
          users: { some: { userId } }
        }
      });
      if (!category) {
        throw new HttpError(
          400,
          "Expense offset category does not exist or is archived"
        );
      }
    }
  }
}

function assertExpenseOffsetAllowed(input: {
  type?: "income" | "expense" | "transfer";
  expenseOffsetCategoryId?: string | null;
}) {
  if (input.expenseOffsetCategoryId && input.type !== "income") {
    throw new HttpError(400, "Expense offsets are only supported for income");
  }
}

function assertTransferAllowed(input: {
  type?: "income" | "expense" | "transfer";
  accountId?: string | null;
  transferToAccountId?: string | null;
  categoryId?: string | null;
  expenseOffsetCategoryId?: string | null;
  groupId?: string | null;
  sharedExpense?: unknown;
}) {
  if (input.type === "transfer") {
    if (!input.accountId) {
      throw new HttpError(400, "From account is required for transfers");
    }

    if (!input.transferToAccountId) {
      throw new HttpError(400, "To account is required for transfers");
    }

    if (input.accountId === input.transferToAccountId) {
      throw new HttpError(400, "Transfer accounts must be different");
    }

    if (input.categoryId || input.expenseOffsetCategoryId || input.groupId) {
      throw new HttpError(
        400,
        "Transfers cannot have category, expense offset, or group fields"
      );
    }

    if (input.sharedExpense) {
      throw new HttpError(400, "Transfers cannot be shared transactions");
    }
  }

  if (input.type !== "transfer" && input.transferToAccountId) {
    throw new HttpError(
      400,
      "Destination account is only supported for transfers"
    );
  }
}

async function deleteSharedTransactionData(
  tx: Prisma.TransactionClient,
  sharedExpense:
    | {
        id: string;
        participants: {
          id: string;
          settlementRequests: { id: string }[];
        }[];
      }
    | null
    | undefined
) {
  if (!sharedExpense) return;

  await tx.notification.deleteMany({
    where: {
      OR: [
        { metadata: { path: ["sharedExpenseId"], equals: sharedExpense.id } },
        ...sharedExpense.participants.map((participant) => ({
          metadata: { path: ["participantId"], equals: participant.id }
        })),
        ...sharedExpense.participants.flatMap((participant) =>
          participant.settlementRequests.map((settlementRequest) => ({
            metadata: {
              path: ["settlementRequestId"],
              equals: settlementRequest.id
            }
          }))
        )
      ]
    }
  });

  await tx.sharedExpense.delete({ where: { id: sharedExpense.id } });
}

const settlementTransactionWhere: Prisma.TransactionWhereInput = {
  OR: [
    { debtorSettlementRequest: { isNot: null } },
    { creditorSettlementRequest: { isNot: null } },
    { relations: { some: { relationType: "settlement_payment" } } },
    { relatedBy: { some: { relationType: "settlement_payment" } } }
  ]
};

const expenseOffsetTransactionWhere: Prisma.TransactionWhereInput = {
  expenseOffsetCategoryId: { not: null }
};

function transactionFilterTypeWhere(
  transactionFilterType?: "normal" | "settlement" | "expenseOffset"
): Prisma.TransactionWhereInput | null {
  if (transactionFilterType === "settlement") {
    return settlementTransactionWhere;
  }

  if (transactionFilterType === "expenseOffset") {
    return expenseOffsetTransactionWhere;
  }

  if (transactionFilterType === "normal") {
    return {
      NOT: [settlementTransactionWhere, expenseOffsetTransactionWhere]
    };
  }

  return null;
}

transactionsRouter.get(
  "/",
  validate(transactionFiltersSchema, "query"),
  asyncHandler(async (req, res) => {
    const filters = req.query as {
      dateFrom?: string;
      dateTo?: string;
      amountFrom?: number;
      amountTo?: number;
      categoryId?: string;
      groupId?: string;
      accountId?: string;
      type?: "income" | "expense" | "transfer";
      transactionFilterType?: "normal" | "settlement" | "expenseOffset";
      classification?: "complete" | "needsClassification";
      search?: string;
    };
    const andFilters: Prisma.TransactionWhereInput[] = [];
    const transactionFilterType = transactionFilterTypeWhere(
      filters.transactionFilterType
    );

    if (transactionFilterType) {
      andFilters.push(transactionFilterType);
    }

    if (filters.classification === "needsClassification") {
      andFilters.push({
        OR: [
          {
            type: "transfer",
            OR: [{ accountId: null }, { transferToAccountId: null }]
          },
          {
            type: { not: "transfer" },
            OR: [{ accountId: null }, { categoryId: null }]
          }
        ]
      });
    }

    if (filters.classification === "complete") {
      andFilters.push({
        OR: [
          {
            type: "transfer",
            accountId: { not: null },
            transferToAccountId: { not: null }
          },
          {
            type: { not: "transfer" },
            accountId: { not: null },
            categoryId: { not: null }
          }
        ]
      });
    }

    if (filters.accountId) {
      andFilters.push({
        OR: [
          { accountId: filters.accountId },
          { transferToAccountId: filters.accountId }
        ]
      });
    }

    const where: Prisma.TransactionWhereInput = {
      userId: req.user!.id,
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.groupId ? { groupId: filters.groupId } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(andFilters.length > 0 ? { AND: andFilters } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" } },
              { notes: { contains: filters.search, mode: "insensitive" } }
            ]
          }
        : {}),
      ...(filters.amountFrom !== undefined || filters.amountTo !== undefined
        ? {
            amount: {
              ...(filters.amountFrom !== undefined
                ? { gte: filters.amountFrom }
                : {}),
              ...(filters.amountTo !== undefined
                ? { lte: filters.amountTo }
                : {})
            }
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
      include: {
        account: true,
        transferToAccount: true,
        category: true,
        expenseOffsetCategory: true,
        group: true
      },
      orderBy: { date: "desc" }
    });

    res.json({ transactions: serialize(transactions) });
  })
);

transactionsRouter.post(
  "/",
  validate(transactionSchema),
  asyncHandler(async (req, res) => {
    assertExpenseOffsetAllowed(req.body);
    assertTransferAllowed(req.body);
    await assertOwnedRelations(req.user!.id, req.body);
    await assertGroupRelations(req.user!.id, req.body);

    const { sharedExpense, ...input } = req.body;
    const transaction = await prisma.$transaction(async (tx) => {
      const createdTransaction = await tx.transaction.create({
        data: { ...input, userId: req.user!.id, date: new Date(input.date) },
        include: {
          account: true,
          transferToAccount: true,
          category: true,
          expenseOffsetCategory: true
        }
      });

      if (sharedExpense) {
        await createSharedExpenseForTransaction(
          tx,
          req.user!.id,
          createdTransaction,
          {
            ...sharedExpense,
            status: "open"
          }
        );
      }

      return tx.transaction.findUniqueOrThrow({
        where: { id: createdTransaction.id },
        include: {
          account: true,
          transferToAccount: true,
          category: true,
          expenseOffsetCategory: true,
          group: true,
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
        transferToAccount: true,
        category: true,
        expenseOffsetCategory: true,
        group: true,
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
      where: { id: req.params.id, userId: req.user!.id },
      include: {
        sharedExpense: {
          include: {
            participants: {
              include: { settlementRequests: true }
            }
          }
        }
      }
    });
    if (!existing) throw notFound("Transaction");

    const relationInput = {
      accountId:
        req.body.accountId !== undefined
          ? req.body.accountId
          : existing.accountId,
      transferToAccountId:
        req.body.transferToAccountId !== undefined
          ? req.body.transferToAccountId
          : existing.transferToAccountId,
      groupId:
        req.body.groupId !== undefined ? req.body.groupId : existing.groupId,
      categoryId:
        req.body.categoryId !== undefined
          ? req.body.categoryId
          : existing.categoryId,
      expenseOffsetCategoryId:
        req.body.expenseOffsetCategoryId !== undefined
          ? req.body.expenseOffsetCategoryId
          : existing.expenseOffsetCategoryId
    };

    assertExpenseOffsetAllowed({
      type: req.body.type !== undefined ? req.body.type : existing.type,
      expenseOffsetCategoryId: relationInput.expenseOffsetCategoryId
    });
    assertTransferAllowed({
      type: req.body.type !== undefined ? req.body.type : existing.type,
      accountId: relationInput.accountId,
      transferToAccountId: relationInput.transferToAccountId,
      categoryId: relationInput.categoryId,
      expenseOffsetCategoryId: relationInput.expenseOffsetCategoryId,
      groupId: relationInput.groupId
    });
    await assertOwnedRelations(req.user!.id, {
      accountId: req.body.accountId,
      transferToAccountId: req.body.transferToAccountId,
      categoryId: req.body.categoryId,
      expenseOffsetCategoryId:
        req.body.expenseOffsetCategoryId !== undefined ||
        req.body.groupId !== undefined
          ? relationInput.expenseOffsetCategoryId
          : undefined,
      groupId: relationInput.groupId
    });
    await assertGroupRelations(req.user!.id, relationInput);

    const transaction = await prisma.$transaction(async (tx) => {
      const updatedTransaction = await tx.transaction.update({
        where: { id: existing.id },
        data: {
          ...req.body,
          ...(req.body.date ? { date: new Date(req.body.date) } : {})
        },
        include: {
          account: true,
          transferToAccount: true,
          category: true,
          expenseOffsetCategory: true,
          group: true
        }
      });

      if (req.body.amount !== undefined) {
        await tx.sharedExpense.updateMany({
          where: { transactionId: existing.id },
          data: { totalAmount: updatedTransaction.amount }
        });
      }

      if (updatedTransaction.type === "transfer") {
        await deleteSharedTransactionData(tx, existing.sharedExpense);
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
      where: { id: req.params.id, userId: req.user!.id },
      include: {
        sharedExpense: {
          include: {
            participants: {
              include: { settlementRequests: true }
            }
          }
        }
      }
    });
    if (!existing) throw notFound("Transaction");

    const sharedExpenseId = existing.sharedExpense?.id;
    const participantIds =
      existing.sharedExpense?.participants.map(
        (participant) => participant.id
      ) ?? [];
    const settlementRequestIds =
      existing.sharedExpense?.participants.flatMap((participant) =>
        participant.settlementRequests.map((request) => request.id)
      ) ?? [];

    await prisma.$transaction(async (tx) => {
      await tx.notification.deleteMany({
        where: {
          OR: [
            { metadata: { path: ["transactionId"], equals: existing.id } },
            ...(sharedExpenseId
              ? [
                  {
                    metadata: {
                      path: ["sharedExpenseId"],
                      equals: sharedExpenseId
                    }
                  }
                ]
              : []),
            ...participantIds.map((participantId) => ({
              metadata: { path: ["participantId"], equals: participantId }
            })),
            ...settlementRequestIds.map((settlementRequestId) => ({
              metadata: {
                path: ["settlementRequestId"],
                equals: settlementRequestId
              }
            }))
          ]
        }
      });

      await tx.transaction.delete({ where: { id: existing.id } });
    });

    res.status(204).send();
  })
);
