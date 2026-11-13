import type { Prisma } from "@prisma/client";
import type { TransactionInput } from "@flowledger/shared";
import { prisma } from "../../../db/prisma.js";
import { HttpError, notFound } from "../../../utils/httpError.js";
import { createSharedExpenseForTransaction } from "../../shared-expenses/services/create.service.js";
import { prepareTransactionInput } from "./prepareTransaction.service.js";
import { resolveAppliedAmounts } from "../utils/appliedAmounts.js";
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

/** Validates relations (account/category/group/transfer/expense-offset) and creates a transaction, optionally with an attached shared expense. When `tx` is given the write runs on that client instead of opening its own transaction, so the caller can commit it atomically with other writes. */
export async function createTransaction(userId: string, body: TransactionInput, tx?: Prisma.TransactionClient) {
  const { input, sharedExpense, currencyFields, appliedAmounts } = await prepareTransactionInput(userId, body);

  const write = async (tx: Prisma.TransactionClient) => {
    const createdTransaction = await tx.transaction.create({
      data: {
        ...input,
        ...currencyFields,
        ...appliedAmounts,
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
  };

  return tx ? write(tx) : prisma.$transaction(write);
}

/** Converts one pending provider-imported transaction into a real `Transaction`, marking the source row `processed`. `accountAmount` is required (400) when the provider currency differs from the linked account's currency. */
export async function importProviderImportedTransaction(input: {
  id: string;
  userId: string;
  categoryId?: string;
  accountAmount?: string;
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
  const importedAmount = existing.amount.abs();
  const appliedAmounts = resolveAppliedAmounts({
    type,
    amount: importedAmount.toFixed(),
    executionCurrency: existing.currency,
    accountCurrency: existing.providerAccount?.account?.currency ?? null,
    accountAmount: input.accountAmount
  });
  const currencyFields = await resolveTransactionCurrencyFields({
    executionCurrency: existing.currency,
    amount: importedAmount,
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
        ...appliedAmounts,
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
  const linkedAccounts = await prisma.providerAccount.findMany({
    where: {
      userId,
      id: { in: rows.flatMap((row) => (row.providerAccountRefId ? [row.providerAccountRefId] : [])) }
    },
    select: { id: true, account: { select: { currency: true } } }
  });
  const rowAccountCurrency = new Map(
    linkedAccounts.map((linked) => [linked.id, linked.account?.currency.toUpperCase()])
  );
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

    const accountCurrency = row.providerAccountRefId ? rowAccountCurrency.get(row.providerAccountRefId) : undefined;
    if (accountCurrency && accountCurrency !== row.currency.toUpperCase()) {
      errors.push(
        importValidationError(
          row.id,
          "accountAmount is required when the currency differs from the account currency; import this row individually with accountAmount"
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
