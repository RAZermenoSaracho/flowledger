import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { findAccountCurrencies } from "./transactionValidation.service.js";

/**
 * Resolves the currency a transaction executes in: explicit `executionCurrency`, else the currency of the user's own
 * account `accountId`, else the user's preferred currency, else `"USD"`. Account lookups are scoped by `userId`, so a
 * foreign or missing account contributes nothing. Also returns the user's `preferredCurrency` for valuation and the
 * account/destination currencies from the same single account lookup.
 *
 * @param db - Client to read the user through; defaults to the shared Prisma client.
 */
export async function resolveExecutionCurrency(
  userId: string,
  input: { executionCurrency?: string | null; accountId?: string | null; transferToAccountId?: string | null },
  db: Prisma.TransactionClient = prisma
) {
  const [currencies, user] = await Promise.all([
    findAccountCurrencies(userId, input.accountId, input.transferToAccountId),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { preferredCurrency: true } })
  ]);
  return {
    currency: input.executionCurrency ?? currencies.accountCurrency ?? user.preferredCurrency ?? "USD",
    preferredCurrency: user.preferredCurrency,
    ...currencies
  };
}
