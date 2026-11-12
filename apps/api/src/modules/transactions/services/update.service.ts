import { Prisma } from "@prisma/client";
import type { UpdateTransactionInput } from "@flowledger/shared";
import { prisma } from "../../../db/prisma.js";
import { badRequest, HttpError, notFound } from "../../../utils/httpError.js";
import { roundMoney } from "../../currencies/utils/roundMoney.js";
import {
  assertExpenseOffsetAllowed,
  assertGroupRelations,
  assertOwnedRelations,
  assertTransferAllowed,
  findAccountCurrencies
} from "./transactionValidation.service.js";
import { resolveAppliedAmounts } from "../utils/appliedAmounts.js";
import { financialFieldsChanged, financialSnapshot } from "../utils/transactionCorrection.js";
import { applySharedExpenseToTransaction } from "../../shared-expenses/services/apply.service.js";
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

/** Updates a transaction's fields, re-validating relations, re-resolving applied amounts (a cross-currency edit must restate them, else 400) and currency fields when amount/currency/type/account change, appending a `TransactionCorrection` when a financial field changes, and applying `sharedExpense` (enable/edit/disable) atomically through `applySharedExpenseToTransaction`; a type change re-proposes or removes sharing under the same guards. Throws a 400 addressed to `amount` when the new amount is below the sum of existing participant shares. */
export async function updateTransaction(userId: string, id: string, input: UpdateTransactionInput) {
  const { sharedExpense: sharedExpenseInput, ...body } = input;
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

  if (body.amount !== undefined && existing.sharedExpense && !sharedExpenseInput) {
    const shares = existing.sharedExpense.participants.reduce(
      (sum, participant) => sum.plus(participant.shareAmount),
      new Prisma.Decimal(0)
    );
    if (new Prisma.Decimal(body.amount).lt(shares)) {
      throw badRequest("Amount cannot be below the sum of participant shares", {
        issues: {
          formErrors: [],
          fieldErrors: { amount: ["Amount cannot be below the sum of participant shares"] }
        }
      });
    }
  }

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

  const mergedType = body.type !== undefined ? body.type : existing.type;
  const mergedExecutionCurrency = body.executionCurrency ?? existing.executionCurrency;
  const amountChanged = body.amount !== undefined;
  const baseChanged =
    amountChanged ||
    mergedType !== existing.type ||
    mergedExecutionCurrency !== existing.executionCurrency;
  const financialInputPresent =
    baseChanged ||
    body.accountId !== undefined ||
    body.transferToAccountId !== undefined ||
    body.accountAmount !== undefined ||
    body.destinationAmount !== undefined ||
    body.feeAmount !== undefined ||
    body.feeCurrency !== undefined;

  let appliedAmounts: ReturnType<typeof resolveAppliedAmounts> | undefined;
  if (financialInputPresent) {
    const currencies = await findAccountCurrencies(
      userId,
      relationInput.accountId,
      relationInput.transferToAccountId
    );
    const sourceUnchanged = !baseChanged && relationInput.accountId === existing.accountId;
    const destinationUnchanged =
      !baseChanged && relationInput.transferToAccountId === existing.transferToAccountId;
    appliedAmounts = resolveAppliedAmounts({
      type: mergedType,
      amount: body.amount ?? existing.amount.toFixed(),
      executionCurrency: mergedExecutionCurrency,
      ...currencies,
      accountAmount:
        body.accountAmount ?? (sourceUnchanged ? existing.accountAmount?.toFixed() : undefined),
      destinationAmount:
        body.destinationAmount ??
        (destinationUnchanged ? existing.destinationAmount?.toFixed() : undefined),
      feeAmount: body.feeAmount === undefined ? existing.feeAmount?.toFixed() : body.feeAmount,
      feeCurrency: body.feeCurrency === undefined ? existing.feeCurrency : body.feeCurrency
    });
  }

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
      amount: body.amount !== undefined ? body.amount : existing.amount,
      preferredCurrency: user.preferredCurrency
    });
  } else if (body.amount !== undefined) {
    currencyFields = {
      amountInPreferredCurrency: roundMoney(
        new Prisma.Decimal(body.amount).times(existing.exchangeRate).toNumber()
      )
    };
  }

  return prisma.$transaction(async (tx) => {
    const updatedTransaction = await tx.transaction.update({
      where: { id: existing.id },
      data: {
        ...body,
        ...(body.date ? { date: new Date(body.date) } : {}),
        ...currencyFields,
        ...appliedAmounts
      },
      include: {
        account: true,
        transferToAccount: true,
        category: true,
        expenseOffsetCategory: true,
        group: true
      }
    });

    const previous = financialSnapshot(existing);
    const corrected = financialSnapshot(updatedTransaction);
    if (financialFieldsChanged(previous, corrected)) {
      await tx.transactionCorrection.create({
        data: {
          transactionId: existing.id,
          userId,
          action: "update",
          previous,
          corrected
        }
      });
    }

    const typeChanged = updatedTransaction.type !== existing.type;
    if (sharedExpenseInput || (existing.sharedExpense && (typeChanged || body.amount !== undefined))) {
      await applySharedExpenseToTransaction(tx, userId, updatedTransaction, existing.type, sharedExpenseInput);
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
  const ids = await resolveImportedTransactionSelectionIds(userId, selection);

  return prisma.$transaction(async (tx) => {
    const rows = await tx.providerImportedTransaction.findMany({
      where: { userId, id: { in: ids } },
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
  const ids = await resolveImportedTransactionSelectionIds(userId, selection);

  return prisma.$transaction(async (tx) => {
    const rows = await tx.providerImportedTransaction.findMany({
      where: { userId, id: { in: ids } },
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
