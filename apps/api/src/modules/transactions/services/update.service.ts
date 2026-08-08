import { prisma } from "../../../db/prisma.js";
import { HttpError, notFound } from "../../../utils/httpError.js";
import { roundMoney } from "../../currencies/utils/roundMoney.js";
import {
  assertExpenseOffsetAllowed,
  assertGroupRelations,
  assertOwnedRelations,
  assertTransferAllowed
} from "./transactionValidation.service.js";
import { deleteSharedTransactionData } from "../utils/sharedTransactionCleanup.js";
import { resolveTransactionCurrencyFields } from "../utils/transactionCurrency.js";
import {
  importedTransactionInclude,
  importedTransactionSelectionWhere,
  importedTransactionType,
  importValidationError
} from "../utils/importedTransactionQuery.js";
import {
  assertImportedTransactionCategory,
  clearProviderPendingNotifications
} from "./importedTransactionValidation.service.js";
import type { ImportedTransactionSelection } from "../types/transactions.types.js";

/** Updates a transaction's fields, re-validating relations, recomputing currency fields when amount/currency changes, and syncing any linked shared expense. */
export async function updateTransaction(userId: string, id: string, body: any) {
  const existing = await prisma.transaction.findFirst({
    where: { id, userId },
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
      body.accountId !== undefined ? body.accountId : existing.accountId,
    transferToAccountId:
      body.transferToAccountId !== undefined
        ? body.transferToAccountId
        : existing.transferToAccountId,
    groupId: body.groupId !== undefined ? body.groupId : existing.groupId,
    categoryId:
      body.categoryId !== undefined ? body.categoryId : existing.categoryId,
    expenseOffsetCategoryId:
      body.expenseOffsetCategoryId !== undefined
        ? body.expenseOffsetCategoryId
        : existing.expenseOffsetCategoryId
  };

  assertExpenseOffsetAllowed({
    type: body.type !== undefined ? body.type : existing.type,
    expenseOffsetCategoryId: relationInput.expenseOffsetCategoryId
  });
  assertTransferAllowed({
    type: body.type !== undefined ? body.type : existing.type,
    accountId: relationInput.accountId,
    transferToAccountId: relationInput.transferToAccountId,
    categoryId: relationInput.categoryId,
    expenseOffsetCategoryId: relationInput.expenseOffsetCategoryId,
    groupId: relationInput.groupId
  });
  await assertOwnedRelations(userId, {
    accountId: body.accountId,
    transferToAccountId: body.transferToAccountId,
    categoryId: body.categoryId,
    expenseOffsetCategoryId:
      body.expenseOffsetCategoryId !== undefined ||
      body.groupId !== undefined
        ? relationInput.expenseOffsetCategoryId
        : undefined,
    groupId: relationInput.groupId
  });
  await assertGroupRelations(userId, relationInput);

  let currencyFields:
    | Awaited<ReturnType<typeof resolveTransactionCurrencyFields>>
    | { amountInPreferredCurrency: number }
    | undefined;
  if (
    body.executionCurrency !== undefined &&
    body.executionCurrency !== existing.executionCurrency
  ) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { preferredCurrency: true }
    });
    currencyFields = await resolveTransactionCurrencyFields({
      executionCurrency: body.executionCurrency,
      amount: body.amount !== undefined ? body.amount : existing.amount.toNumber(),
      preferredCurrency: user.preferredCurrency
    });
  } else if (body.amount !== undefined) {
    currencyFields = {
      amountInPreferredCurrency: roundMoney(
        body.amount * existing.exchangeRate.toNumber()
      )
    };
  }

  return prisma.$transaction(async (tx) => {
    const updatedTransaction = await tx.transaction.update({
      where: { id: existing.id },
      data: {
        ...body,
        ...(body.date ? { date: new Date(body.date) } : {}),
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

    if (body.amount !== undefined) {
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
}

/** Updates the category on a pending imported transaction; throws if it's not still pending. */
export async function updateImportedTransactionCategory(
  userId: string,
  id: string,
  body: { categoryId?: string | null }
) {
  const existing = await prisma.providerImportedTransaction.findFirst({
    where: { id, userId },
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
    userId,
    categoryId: body.categoryId,
    type
  });

  return prisma.providerImportedTransaction.update({
    where: { id: existing.id },
    data: { categoryId: body.categoryId },
    include: importedTransactionInclude
  });
}

/** Marks a pending imported transaction as ignored; throws if it isn't currently pending. */
export async function ignoreImportedTransaction(userId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.providerImportedTransaction.updateMany({
      where: {
        id,
        userId,
        status: "pending"
      },
      data: { status: "ignored", errorMessage: null }
    });

    if (updated.count === 0) {
      const existing = await tx.providerImportedTransaction.findFirst({
        where: { id, userId }
      });
      if (!existing) throw notFound("Imported transaction");
      throw new HttpError(
        400,
        "Only pending imported transactions can be ignored"
      );
    }

    await clearProviderPendingNotifications(tx, userId);

    return tx.providerImportedTransaction.findUniqueOrThrow({
      where: { id },
      include: importedTransactionInclude
    });
  });
}

/** Reverts an ignored imported transaction back to pending; throws if it isn't currently ignored. */
export async function unignoreImportedTransaction(userId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.providerImportedTransaction.updateMany({
      where: {
        id,
        userId,
        status: "ignored"
      },
      data: { status: "pending" }
    });

    if (updated.count === 0) {
      const existing = await tx.providerImportedTransaction.findFirst({
        where: { id, userId }
      });
      if (!existing) throw notFound("Imported transaction");
      throw new HttpError(
        400,
        "Only ignored imported transactions can be unignored"
      );
    }

    return tx.providerImportedTransaction.findUniqueOrThrow({
      where: { id },
      include: importedTransactionInclude
    });
  });
}

/** Ignores a selection/batch of imported transactions; throws with all per-row errors if any selected row isn't pending. */
export async function batchIgnoreImportedTransactions(
  userId: string,
  selection: ImportedTransactionSelection
) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.providerImportedTransaction.findMany({
      where: importedTransactionSelectionWhere(userId, selection),
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
      throw new HttpError(400, "Some imported transactions cannot be ignored", {
        errors
      });
    }

    const updated = await tx.providerImportedTransaction.updateMany({
      where: {
        id: { in: rows.map((row) => row.id) },
        userId,
        status: "pending"
      },
      data: { status: "ignored", errorMessage: null }
    });

    await clearProviderPendingNotifications(tx, userId);

    return updated.count;
  });
}

/** Un-ignores a selection/batch of imported transactions; throws with all per-row errors if any selected row isn't ignored. */
export async function batchUnignoreImportedTransactions(
  userId: string,
  selection: ImportedTransactionSelection
) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.providerImportedTransaction.findMany({
      where: importedTransactionSelectionWhere(userId, selection),
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
        userId,
        status: "ignored"
      },
      data: { status: "pending" }
    });

    return updated.count;
  });
}
