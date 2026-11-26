import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { TransactionInput } from "@flowledger/shared";
import { prisma } from "../../../db/prisma.js";
import { HttpError, notFound } from "../../../utils/httpError.js";
import { createSharedExpenseForTransaction } from "../../shared-expenses/services/create.service.js";
import { prepareTransactionInput } from "./prepareTransaction.service.js";
import { resolveAppliedAmounts } from "../utils/appliedAmounts.js";
import { BATCH_IMPORT_TRANSACTION_TIMEOUT_MS, MAX_BATCH_IMPORT_ROWS } from "../utils/boundedPagination.js";
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
import type { ImportedTransactionSelection, ResolvedImport } from "../types/transactions.types.js";

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

function isCardCredit(type: "income" | "expense", accountType: string | null | undefined) {
  return type === "income" && accountType === "credit_card";
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

  if (!categoryId && !isCardCredit(type, existing.providerAccount?.account?.type)) {
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
    await createImportedTransactionsInTx(tx, input.userId, [
      { id: existing.id, categoryId, type, appliedAmounts, currencyFields }
    ]);
    await clearProviderPendingNotifications(tx, input.userId);
    return tx.providerImportedTransaction.findUniqueOrThrow({
      where: { id: existing.id },
      include: importedTransactionInclude
    });
  });
}

/**
 * Imports `resolved` rows on `tx` in a constant number of statements plus one link update per row. A single guarded `updateMany` claims every row that is still pending and its count must match, so a row imported, ignored or removed since validation throws 400 and rolls back the caller's transaction. Callers re-read the hydrated rows once afterwards.
 */
async function createImportedTransactionsInTx(
  tx: Prisma.TransactionClient,
  userId: string,
  resolved: ResolvedImport[]
) {
  const ids = resolved.map((row) => row.id);
  const claimed = await tx.providerImportedTransaction.updateMany({
    where: { id: { in: ids }, userId, status: "pending" },
    data: { status: "processed", errorMessage: null }
  });
  if (claimed.count !== ids.length) {
    throw new HttpError(400, "Only pending imported transactions can be imported");
  }

  const sources = new Map(
    (
      await tx.providerImportedTransaction.findMany({
        where: { id: { in: ids }, userId },
        include: { providerAccount: true }
      })
    ).map((row) => [row.id, row])
  );
  const transactionIds = new Map(ids.map((id) => [id, randomUUID()]));

  await tx.transaction.createMany({
    data: resolved.map((row) => {
      const source = sources.get(row.id)!;
      return {
        id: transactionIds.get(row.id)!,
        userId,
        name: source.description,
        amount: source.amount.abs(),
        ...row.currencyFields,
        ...row.appliedAmounts,
        type: row.type,
        date: source.transactionDate,
        categoryId: row.categoryId ?? null,
        accountId: source.providerAccount?.accountId ?? null
      };
    })
  });

  for (const row of resolved) {
    await tx.providerImportedTransaction.update({
      where: { id: row.id },
      data: { categoryId: row.categoryId ?? null, transactionId: transactionIds.get(row.id)! }
    });
  }
}

/** Imports a selection/batch of pending imported transactions atomically: validates every row up front (400 with all per-row errors, including ids that are not the user's), then creates them in one database transaction so a failed write rolls back the whole batch. A selection above `MAX_BATCH_IMPORT_ROWS` is a 400. */
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
  if (ids.length > MAX_BATCH_IMPORT_ROWS) {
    throw new HttpError(
      400,
      `A batch import is limited to ${MAX_BATCH_IMPORT_ROWS} imported transactions; narrow the filter`
    );
  }
  const rows = await prisma.providerImportedTransaction.findMany({
    where: { userId, id: { in: ids } }
  });
  const linkedAccounts = await prisma.providerAccount.findMany({
    where: {
      userId,
      id: { in: rows.flatMap((row) => (row.providerAccountRefId ? [row.providerAccountRefId] : [])) }
    },
    select: { id: true, account: { select: { currency: true, type: true } } }
  });
  const rowAccountCurrency = new Map(
    linkedAccounts.map((linked) => [linked.id, linked.account?.currency.toUpperCase()])
  );
  const rowAccountType = new Map(
    linkedAccounts.map((linked) => [linked.id, linked.account?.type])
  );
  const errors: { id: string; message: string }[] = [];
  const valid: { row: (typeof rows)[number]; type: "income" | "expense"; categoryId: string | null; accountCurrency: string | undefined }[] = [];

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
    const cardCredit = isCardCredit(
      type,
      row.providerAccountRefId ? rowAccountType.get(row.providerAccountRefId) : undefined
    );
    if (!categoryId && !cardCredit) {
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
      continue;
    }

    valid.push({ row, type, categoryId, accountCurrency });
  }

  if (errors.length > 0) {
    throw new HttpError(400, "Some imported transactions cannot be imported", {
      errors
    });
  }

  const { preferredCurrency } = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { preferredCurrency: true }
  });
  const resolvedRows: ResolvedImport[] = [];
  for (const { row, type, categoryId, accountCurrency } of valid) {
    const importedAmount = row.amount.abs();
    resolvedRows.push({
      id: row.id,
      categoryId,
      type,
      appliedAmounts: resolveAppliedAmounts({
        type,
        amount: importedAmount.toFixed(),
        executionCurrency: row.currency,
        accountCurrency: accountCurrency ?? null
      }),
      currencyFields: await resolveTransactionCurrencyFields({
        executionCurrency: row.currency,
        amount: importedAmount,
        preferredCurrency
      })
    });
  }

  const importedTransactions = await prisma.$transaction(
    async (tx) => {
      await createImportedTransactionsInTx(tx, userId, resolvedRows);
      await clearProviderPendingNotifications(tx, userId);
      const imported = await tx.providerImportedTransaction.findMany({
        where: { userId, id: { in: resolvedRows.map((resolved) => resolved.id) } },
        include: importedTransactionInclude
      });
      const byId = new Map(imported.map((row) => [row.id, row]));
      return resolvedRows.map((resolved) => byId.get(resolved.id)!);
    },
    { timeout: BATCH_IMPORT_TRANSACTION_TIMEOUT_MS }
  );

  return {
    importedTransactions,
    importedCount: importedTransactions.length,
    errors: [] as { id: string; message: string }[]
  };
}
