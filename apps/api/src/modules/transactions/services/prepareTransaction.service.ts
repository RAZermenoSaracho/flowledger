import type { TransactionInput } from "@flowledger/shared";
import { resolveAppliedAmounts } from "../utils/appliedAmounts.js";
import { resolveTransactionCurrencyFields } from "../utils/transactionCurrency.js";
import { resolveExecutionCurrency } from "./currencyResolution.service.js";
import {
  assertExpenseOffsetAllowed,
  assertGroupRelations,
  assertOwnedRelations,
  assertTransferAllowed
} from "./transactionValidation.service.js";

/**
 * Read-only validation shared by `createTransaction` and the notification Playground: relation ownership/archived
 * checks, currency resolution, applied amounts and currency valuation. Throws the same `HttpError`s a create would.
 *
 * @returns The input without `sharedExpense`/`executionCurrency`, plus the resolved `executionCurrency`, `currencyFields` and `appliedAmounts` to persist.
 */
export async function prepareTransactionInput(userId: string, body: TransactionInput) {
  assertExpenseOffsetAllowed(body);
  assertTransferAllowed(body);
  await assertOwnedRelations(userId, body);
  await assertGroupRelations(userId, body);

  const { sharedExpense, executionCurrency, ...input } = body;
  const { currency, preferredCurrency, accountCurrency, destinationCurrency } = await resolveExecutionCurrency(userId, {
    executionCurrency,
    accountId: input.accountId,
    transferToAccountId: input.transferToAccountId
  });
  const appliedAmounts = resolveAppliedAmounts({
    ...input,
    executionCurrency: currency,
    accountCurrency,
    destinationCurrency
  });
  const currencyFields = await resolveTransactionCurrencyFields({
    executionCurrency: currency,
    amount: input.amount,
    preferredCurrency
  });
  return { input, sharedExpense, executionCurrency: currency, currencyFields, appliedAmounts };
}
