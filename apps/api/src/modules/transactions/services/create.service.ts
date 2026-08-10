import { prisma } from "../../../db/prisma.js";
import { HttpError, notFound } from "../../../utils/httpError.js";
import { createSharedExpenseForTransaction } from "../../shared-expenses/services/create.service.js";
import {
  assertExpenseOffsetAllowed,
  assertGroupRelations,
  assertOwnedRelations,
  assertTransferAllowed
} from "./transactionValidation.service.js";
import { resolveTransactionCurrencyFields } from "../utils/transactionCurrency.js";
import {
  importedTransactionInclude,
  importedTransactionType,
  importValidationError,
  resolveImportedTransactionSelectionIds
} from "../utils/importedTransactionQuery.js";
import {
  assertImportedTransactionCategory,
  clearProviderPendingNotifications
} from "./importedTransactionValidation.service.js";
import type { ImportedTransactionSelection } from "../types/transactions.types.js";

/** Validates relations (account/category/group/transfer/expense-offset) and creates a transaction, optionally with an attached shared expense. */
export async function createTransaction(userId: string, body: any) {
  assertExpenseOffsetAllowed(body);
  assertTransferAllowed(body);
  await assertOwnedRelations(userId, body);
  await assertGroupRelations(userId, body);

  const { sharedExpense, executionCurrency, ...input } = body;
  const [account, user] = await Promise.all([
    input.accountId
      ? prisma.account.findUnique({
          where: { id: input.accountId },
          select: { currency: true }
        })
      : null,
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { preferredCurrency: true }
    })
  ]);
  const currencyFields = await resolveTransactionCurrencyFields({
    executionCurrency:
      executionCurrency ?? account?.currency ?? user.preferredCurrency ?? "USD",
    amount: input.amount,
    preferredCurrency: user.preferredCurrency
  });

  return prisma.$transaction(async (tx) => {
    const createdTransaction = await tx.transaction.create({
      data: {
        ...input,
        ...currencyFields,
        userId,
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
      await createSharedExpenseForTransaction(tx, userId, createdTransaction, {
        ...sharedExpense,
        status: "open"
      });
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
}

/** Converts one pending provider-imported transaction into a real `Transaction`, marking the source row `processed`. */
export async function importProviderImportedTransaction(input: {
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

/** Imports a selection/batch of pending imported transactions; validates every row up front and throws with all per-row errors if any fail before importing any of them. */
export async function batchImportProviderImportedTransactions(
  userId: string,
  body: {
    selection: ImportedTransactionSelection;
    categoryId?: string;
  }
) {
  const selection = body.selection;
  const batchCategoryId = body.categoryId;
  const ids = await resolveImportedTransactionSelectionIds(userId, selection);
  const rows = await prisma.providerImportedTransaction.findMany({
    where: { userId, id: { in: ids } }
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
        userId,
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
    throw new HttpError(400, "Some imported transactions cannot be imported", {
      errors
    });
  }

  const importedTransactions = [];
  for (const row of rows) {
    importedTransactions.push(
      await importProviderImportedTransaction({
        id: row.id,
        userId,
        categoryId: batchCategoryId ?? row.categoryId ?? undefined
      })
    );
  }

  return {
    importedTransactions,
    importedCount: importedTransactions.length,
    errors: [] as { id: string; message: string }[]
  };
}
