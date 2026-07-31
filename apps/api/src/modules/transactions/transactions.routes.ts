import {
  batchIgnoreProviderImportedTransactionsSchema,
  batchImportProviderImportedTransactionsSchema,
  batchUnignoreProviderImportedTransactionsSchema,
  importProviderImportedTransactionSchema,
  providerImportedTransactionFiltersSchema,
  transactionFiltersSchema,
  transactionSchema,
  updateProviderImportedTransactionSchema,
  updateTransactionSchema
} from "@flowledger/shared";
import { Prisma } from "@prisma/client";
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
import { roundMoney } from "../currencies/exchangeRate.service.js";
import { resolveTransactionCurrencyFields } from "./transactionCurrency.js";

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
      throw new HttpError(
        400,
        "Source and destination accounts must be different"
      );
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

type ImportedTransactionStatus = "pending" | "processed" | "ignored";

type ImportedTransactionFilters = {
  status?: ImportedTransactionStatus;
  search?: string;
  provider?: string;
  accountId?: string;
  providerAccountId?: string;
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
  amountFrom?: number;
  amountTo?: number;
  sortBy?: "transactionDate" | "amount" | "description" | "provider" | "status";
  sortDirection?: "asc" | "desc";
};

type ImportedTransactionSelection =
  | { mode: "ids"; ids: string[] }
  | { mode: "filtered"; filters?: ImportedTransactionFilters };

const importedTransactionInclude = {
  providerAccount: {
    include: {
      account: true,
      connection: {
        select: {
          id: true,
          institutionId: true,
          institutionName: true,
          status: true,
          lastSyncAt: true
        }
      }
    }
  },
  category: true,
  transaction: true
} satisfies Prisma.ProviderImportedTransactionInclude;

function importedTransactionWhere(
  userId: string,
  filters: ImportedTransactionFilters = {}
) {
  const andFilters: Prisma.ProviderImportedTransactionWhereInput[] = [];
  const search = filters.search?.trim();

  if (filters.accountId) {
    andFilters.push({
      providerAccount: { accountId: filters.accountId }
    });
  }

  if (filters.providerAccountId) {
    andFilters.push({
      OR: [
        { providerAccountRefId: filters.providerAccountId },
        { providerAccountId: filters.providerAccountId }
      ]
    });
  }

  if (search) {
    const searchFilters: Prisma.ProviderImportedTransactionWhereInput[] = [
      { description: { contains: search, mode: "insensitive" } },
      { provider: { contains: search, mode: "insensitive" } },
      {
        providerCredentialId: { contains: search, mode: "insensitive" }
      },
      {
        providerAccountId: { contains: search, mode: "insensitive" }
      },
      {
        providerTransactionId: { contains: search, mode: "insensitive" }
      },
      {
        category: { name: { contains: search, mode: "insensitive" } }
      },
      {
        providerAccount: {
          providerAccountId: { contains: search, mode: "insensitive" }
        }
      },
      {
        providerAccount: {
          account: {
            name: { contains: search, mode: "insensitive" }
          }
        }
      },
      {
        providerAccount: {
          connection: {
            institutionName: {
              contains: search,
              mode: "insensitive"
            }
          }
        }
      },
      {
        providerAccount: {
          connection: {
            institutionId: {
              contains: search,
              mode: "insensitive"
            }
          }
        }
      },
      {
        providerAccount: {
          accountMetadata: {
            path: ["name"],
            string_contains: search,
            mode: "insensitive"
          }
        }
      },
      {
        providerAccount: {
          accountMetadata: {
            path: ["type"],
            string_contains: search,
            mode: "insensitive"
          }
        }
      },
      {
        providerAccount: {
          accountMetadata: {
            path: ["currency"],
            string_contains: search,
            mode: "insensitive"
          }
        }
      }
    ];

    try {
      const amount = new Prisma.Decimal(search);
      if (!amount.isNaN()) {
        searchFilters.push({ amount });
      }
    } catch {
      // Non-numeric search terms should still match text and date fields.
    }

    const dateSearch = /^\d{4}-\d{2}-\d{2}/.test(search)
      ? new Date(search)
      : null;
    if (dateSearch && !Number.isNaN(dateSearch.getTime())) {
      const nextDay = new Date(dateSearch);
      nextDay.setDate(nextDay.getDate() + 1);
      searchFilters.push({
        transactionDate: {
          gte: dateSearch,
          lt: nextDay
        }
      });
    }

    andFilters.push({
      OR: searchFilters
    });
  }

  const transactionDateFilter =
    filters.dateFrom || filters.dateTo
      ? {
          ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
          ...(filters.dateTo
            ? {
                lte: (() => {
                  const endDate = new Date(filters.dateTo!);
                  endDate.setHours(23, 59, 59, 999);
                  return endDate;
                })()
              }
            : {})
        }
      : undefined;

  return {
    userId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.provider ? { provider: filters.provider } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.amountFrom !== undefined || filters.amountTo !== undefined
      ? {
          amount: {
            ...(filters.amountFrom !== undefined
              ? { gte: filters.amountFrom }
              : {}),
            ...(filters.amountTo !== undefined ? { lte: filters.amountTo } : {})
          }
        }
      : {}),
    ...(transactionDateFilter ? { transactionDate: transactionDateFilter } : {}),
    ...(andFilters.length > 0 ? { AND: andFilters } : {})
  } satisfies Prisma.ProviderImportedTransactionWhereInput;
}

function importedTransactionOrderBy(filters: ImportedTransactionFilters) {
  return {
    [filters.sortBy ?? "transactionDate"]: filters.sortDirection ?? "desc"
  } satisfies Prisma.ProviderImportedTransactionOrderByWithRelationInput;
}

function importedTransactionSelectionWhere(
  userId: string,
  selection: ImportedTransactionSelection
) {
  if (selection.mode === "ids") {
    return {
      userId,
      id: { in: Array.from(new Set(selection.ids)) }
    } satisfies Prisma.ProviderImportedTransactionWhereInput;
  }

  return importedTransactionWhere(userId, selection.filters ?? {});
}

function importedTransactionType(amount: Prisma.Decimal) {
  if (amount.lessThan(0)) return "expense" as const;
  if (amount.greaterThan(0)) return "income" as const;
  throw new HttpError(
    400,
    "Imported transactions with a zero amount cannot be imported"
  );
}

async function assertImportedTransactionCategory(input: {
  userId: string;
  categoryId: string | null | undefined;
  type?: "income" | "expense";
}) {
  if (!input.categoryId) return null;

  const category = await prisma.category.findFirst({
    where: {
      id: input.categoryId,
      groupId: null,
      isArchived: false,
      users: { some: { userId: input.userId } },
      ...(input.type ? { type: input.type } : {})
    }
  });

  if (!category) {
    throw new HttpError(
      400,
      "Category does not exist, is archived, or does not match the transaction type"
    );
  }

  return category;
}

function importValidationError(id: string, message: string) {
  return { id, message };
}

async function clearProviderPendingNotifications(
  tx: Prisma.TransactionClient,
  userId: string
) {
  const pendingCount = await tx.providerImportedTransaction.count({
    where: { userId, status: "pending" }
  });

  if (pendingCount > 0) return;

  await tx.notification.updateMany({
    where: {
      userId,
      type: "provider_transactions_pending",
      readAt: null
    },
    data: { readAt: new Date() }
  });
}

async function importProviderImportedTransaction(input: {
  id: string;
  userId: string;
  categoryId?: string;
}) {
  const existing = await prisma.providerImportedTransaction.findFirst({
    where: { id: input.id, userId: input.userId },
    include: importedTransactionInclude
  });

  if (!existing) throw notFound("Imported transaction");
  if (existing.status !== "pending") {
    throw new HttpError(
      400,
      "Only pending imported transactions can be imported"
    );
  }

  const type = importedTransactionType(existing.amount);
  const categoryId = input.categoryId ?? existing.categoryId;
  await assertImportedTransactionCategory({
    userId: input.userId,
    categoryId,
    type
  });

  if (!categoryId) {
    throw new HttpError(400, "Category is required before importing");
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: input.userId },
    select: { preferredCurrency: true }
  });
  const currencyFields = await resolveTransactionCurrencyFields({
    executionCurrency: existing.currency,
    amount: existing.amount.abs().toNumber(),
    preferredCurrency: user.preferredCurrency
  });

  return prisma.$transaction(async (tx) => {
    const current = await tx.providerImportedTransaction.findFirst({
      where: { id: existing.id, userId: input.userId },
      include: { providerAccount: true }
    });

    if (!current) throw notFound("Imported transaction");
    if (current.status !== "pending") {
      throw new HttpError(
        400,
        "Only pending imported transactions can be imported"
      );
    }

    const transaction = await tx.transaction.create({
      data: {
        userId: input.userId,
        name: current.description,
        amount: current.amount.abs(),
        ...currencyFields,
        type,
        date: current.transactionDate,
        categoryId,
        accountId: current.providerAccount?.accountId ?? null
      }
    });

    const importedTransaction = await tx.providerImportedTransaction.update({
      where: { id: current.id },
      data: {
        status: "processed",
        errorMessage: null,
        categoryId,
        transactionId: transaction.id
      },
      include: importedTransactionInclude
    });

    await clearProviderPendingNotifications(tx, input.userId);

    return importedTransaction;
  });
}

transactionsRouter.get(
  "/imported",
  validate(providerImportedTransactionFiltersSchema, "query"),
  asyncHandler(async (req, res) => {
    const filters = req.query as ImportedTransactionFilters;
    const where = importedTransactionWhere(req.user!.id, filters);
    const [importedTransactions, total, pendingCount] = await Promise.all([
      prisma.providerImportedTransaction.findMany({
        where,
        include: importedTransactionInclude,
        orderBy: importedTransactionOrderBy(filters)
      }),
      prisma.providerImportedTransaction.count({ where }),
      prisma.providerImportedTransaction.count({
        where: { userId: req.user!.id, status: "pending" }
      })
    ]);

    res.json({
      importedTransactions: serialize(importedTransactions),
      total,
      pendingCount
    });
  })
);

transactionsRouter.get(
  "/imported/pending-count",
  asyncHandler(async (req, res) => {
    const count = await prisma.providerImportedTransaction.count({
      where: { userId: req.user!.id, status: "pending" }
    });

    res.json({ count });
  })
);

transactionsRouter.patch(
  "/imported/:id",
  validate(updateProviderImportedTransactionSchema),
  asyncHandler(async (req, res) => {
    const importedTransactionId = req.params.id;
    if (!importedTransactionId) throw notFound("Imported transaction");

    const existing = await prisma.providerImportedTransaction.findFirst({
      where: { id: importedTransactionId, userId: req.user!.id },
      include: importedTransactionInclude
    });

    if (!existing) throw notFound("Imported transaction");
    if (existing.status !== "pending") {
      throw new HttpError(
        400,
        "Only pending imported transactions can be updated"
      );
    }

    const type = importedTransactionType(existing.amount);
    await assertImportedTransactionCategory({
      userId: req.user!.id,
      categoryId: req.body.categoryId,
      type
    });

    const importedTransaction = await prisma.providerImportedTransaction.update(
      {
        where: { id: existing.id },
        data: { categoryId: req.body.categoryId },
        include: importedTransactionInclude
      }
    );

    res.json({ importedTransaction: serialize(importedTransaction) });
  })
);

transactionsRouter.post(
  "/imported/:id/import",
  validate(importProviderImportedTransactionSchema),
  asyncHandler(async (req, res) => {
    const importedTransactionId = req.params.id;
    if (!importedTransactionId) throw notFound("Imported transaction");

    const importedTransaction = await importProviderImportedTransaction({
      id: importedTransactionId,
      userId: req.user!.id,
      categoryId: req.body.categoryId
    });

    res
      .status(201)
      .json({ importedTransaction: serialize(importedTransaction) });
  })
);

transactionsRouter.post(
  "/imported/:id/ignore",
  asyncHandler(async (req, res) => {
    const importedTransactionId = req.params.id;
    if (!importedTransactionId) throw notFound("Imported transaction");

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.providerImportedTransaction.updateMany({
        where: {
          id: importedTransactionId,
          userId: req.user!.id,
          status: "pending"
        },
        data: { status: "ignored", errorMessage: null }
      });

      if (updated.count === 0) {
        const existing = await tx.providerImportedTransaction.findFirst({
          where: { id: importedTransactionId, userId: req.user!.id }
        });
        if (!existing) throw notFound("Imported transaction");
        throw new HttpError(
          400,
          "Only pending imported transactions can be ignored"
        );
      }

      await clearProviderPendingNotifications(tx, req.user!.id);

      return tx.providerImportedTransaction.findUniqueOrThrow({
        where: { id: importedTransactionId },
        include: importedTransactionInclude
      });
    });

    res.json({ importedTransaction: serialize(result) });
  })
);

transactionsRouter.post(
  "/imported/:id/unignore",
  asyncHandler(async (req, res) => {
    const importedTransactionId = req.params.id;
    if (!importedTransactionId) throw notFound("Imported transaction");

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.providerImportedTransaction.updateMany({
        where: {
          id: importedTransactionId,
          userId: req.user!.id,
          status: "ignored"
        },
        data: { status: "pending" }
      });

      if (updated.count === 0) {
        const existing = await tx.providerImportedTransaction.findFirst({
          where: { id: importedTransactionId, userId: req.user!.id }
        });
        if (!existing) throw notFound("Imported transaction");
        throw new HttpError(
          400,
          "Only ignored imported transactions can be unignored"
        );
      }

      return tx.providerImportedTransaction.findUniqueOrThrow({
        where: { id: importedTransactionId },
        include: importedTransactionInclude
      });
    });

    res.json({ importedTransaction: serialize(result) });
  })
);

transactionsRouter.post(
  "/imported/batch-import",
  validate(batchImportProviderImportedTransactionsSchema),
  asyncHandler(async (req, res) => {
    const selection = req.body.selection as ImportedTransactionSelection;
    const batchCategoryId = req.body.categoryId as string | undefined;
    const rows = await prisma.providerImportedTransaction.findMany({
      where: importedTransactionSelectionWhere(req.user!.id, selection),
      orderBy: importedTransactionOrderBy(
        selection.mode === "filtered" ? (selection.filters ?? {}) : {}
      )
    });
    const errors: { id: string; message: string }[] = [];

    for (const row of rows) {
      if (row.status !== "pending") {
        errors.push(
          importValidationError(
            row.id,
            "Only pending imported transactions can be imported"
          )
        );
        continue;
      }

      let type: "income" | "expense";
      try {
        type = importedTransactionType(row.amount);
      } catch (error) {
        errors.push(
          importValidationError(
            row.id,
            error instanceof Error
              ? error.message
              : "Imported transaction cannot be imported"
          )
        );
        continue;
      }

      const categoryId = batchCategoryId ?? row.categoryId;
      if (!categoryId) {
        errors.push(
          importValidationError(row.id, "Category is required before importing")
        );
        continue;
      }

      try {
        await assertImportedTransactionCategory({
          userId: req.user!.id,
          categoryId,
          type
        });
      } catch (error) {
        errors.push(
          importValidationError(
            row.id,
            error instanceof Error ? error.message : "Category is invalid"
          )
        );
      }
    }

    if (errors.length > 0) {
      throw new HttpError(
        400,
        "Some imported transactions cannot be imported",
        {
          errors
        }
      );
    }

    const importedTransactions = [];
    for (const row of rows) {
      importedTransactions.push(
        await importProviderImportedTransaction({
          id: row.id,
          userId: req.user!.id,
          categoryId: batchCategoryId ?? row.categoryId ?? undefined
        })
      );
    }

    res.status(201).json({
      importedTransactions: serialize(importedTransactions),
      importedCount: importedTransactions.length,
      errors: []
    });
  })
);

transactionsRouter.post(
  "/imported/batch-ignore",
  validate(batchIgnoreProviderImportedTransactionsSchema),
  asyncHandler(async (req, res) => {
    const selection = req.body.selection as ImportedTransactionSelection;
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.providerImportedTransaction.findMany({
        where: importedTransactionSelectionWhere(req.user!.id, selection),
        select: { id: true, status: true }
      });
      const errors = rows
        .filter((row) => row.status !== "pending")
        .map((row) =>
          importValidationError(
            row.id,
            "Only pending imported transactions can be ignored"
          )
        );

      if (errors.length > 0) {
        throw new HttpError(
          400,
          "Some imported transactions cannot be ignored",
          {
            errors
          }
        );
      }

      const updated = await tx.providerImportedTransaction.updateMany({
        where: {
          id: { in: rows.map((row) => row.id) },
          userId: req.user!.id,
          status: "pending"
        },
        data: { status: "ignored", errorMessage: null }
      });

      await clearProviderPendingNotifications(tx, req.user!.id);

      return updated.count;
    });

    res.json({ ignoredCount: result, errors: [] });
  })
);

transactionsRouter.post(
  "/imported/batch-unignore",
  validate(batchUnignoreProviderImportedTransactionsSchema),
  asyncHandler(async (req, res) => {
    const selection = req.body.selection as ImportedTransactionSelection;
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.providerImportedTransaction.findMany({
        where: importedTransactionSelectionWhere(req.user!.id, selection),
        select: { id: true, status: true }
      });
      const errors = rows
        .filter((row) => row.status !== "ignored")
        .map((row) =>
          importValidationError(
            row.id,
            "Only ignored imported transactions can be unignored"
          )
        );

      if (errors.length > 0) {
        throw new HttpError(
          400,
          "Some imported transactions cannot be unignored",
          {
            errors
          }
        );
      }

      const updated = await tx.providerImportedTransaction.updateMany({
        where: {
          id: { in: rows.map((row) => row.id) },
          userId: req.user!.id,
          status: "ignored"
        },
        data: { status: "pending" }
      });

      return updated.count;
    });

    res.json({ unignoredCount: result, errors: [] });
  })
);

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

    const { sharedExpense, executionCurrency, ...input } = req.body;
    const [account, user] = await Promise.all([
      input.accountId
        ? prisma.account.findUnique({
            where: { id: input.accountId },
            select: { currency: true }
          })
        : null,
      prisma.user.findUniqueOrThrow({
        where: { id: req.user!.id },
        select: { preferredCurrency: true }
      })
    ]);
    const currencyFields = await resolveTransactionCurrencyFields({
      executionCurrency:
        executionCurrency ?? account?.currency ?? user.preferredCurrency ?? "USD",
      amount: input.amount,
      preferredCurrency: user.preferredCurrency
    });

    const transaction = await prisma.$transaction(async (tx) => {
      const createdTransaction = await tx.transaction.create({
        data: {
          ...input,
          ...currencyFields,
          userId: req.user!.id,
          date: new Date(input.date)
        },
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

    let currencyFields:
      | Awaited<ReturnType<typeof resolveTransactionCurrencyFields>>
      | { amountInPreferredCurrency: number }
      | undefined;
    if (
      req.body.executionCurrency !== undefined &&
      req.body.executionCurrency !== existing.executionCurrency
    ) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.user!.id },
        select: { preferredCurrency: true }
      });
      currencyFields = await resolveTransactionCurrencyFields({
        executionCurrency: req.body.executionCurrency,
        amount:
          req.body.amount !== undefined
            ? req.body.amount
            : existing.amount.toNumber(),
        preferredCurrency: user.preferredCurrency
      });
    } else if (req.body.amount !== undefined) {
      currencyFields = {
        amountInPreferredCurrency: roundMoney(
          req.body.amount * existing.exchangeRate.toNumber()
        )
      };
    }

    const transaction = await prisma.$transaction(async (tx) => {
      const updatedTransaction = await tx.transaction.update({
        where: { id: existing.id },
        data: {
          ...req.body,
          ...(req.body.date ? { date: new Date(req.body.date) } : {}),
          ...currencyFields
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
