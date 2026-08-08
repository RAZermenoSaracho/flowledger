import type { AccountType, Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { getExchangeRate } from "../../currencies/services/read.service.js";
import { roundMoney } from "../../currencies/utils/roundMoney.js";
import { withAccountBalances } from "../../transactions/utils/transactionCalculations.js";
import { accountListItemWithSyncSummary } from "../utils/accountSyncSummary.js";

async function withPreferredCurrencyBalances<
  TAccount extends { currency: string; currentBalance: number }
>(accounts: TAccount[], preferredCurrency: string | null) {
  return Promise.all(
    accounts.map(async (account) => {
      if (!preferredCurrency || account.currency === preferredCurrency) {
        return {
          ...account,
          currentBalanceInPreferredCurrency: account.currentBalance
        };
      }

      const rate = await getExchangeRate(account.currency, preferredCurrency);
      return {
        ...account,
        currentBalanceInPreferredCurrency: roundMoney(
          account.currentBalance * rate
        )
      };
    })
  );
}

/** Lists a user's accounts with archive/type/source filters and sorting, enriched with computed balances (in both native and preferred currency) and provider sync summaries. */
export async function listAccounts(
  userId: string,
  filters: {
    includeArchived?: string;
    sortBy?: "name" | "createdAt" | "updatedAt";
    sortDirection?: "asc" | "desc";
    types?: string[];
    sources?: string[];
  }
) {
  const wantsManual = filters.sources?.includes("manual") ?? false;
  const wantsSynced = filters.sources?.includes("synced") ?? false;

  const where: Prisma.AccountWhereInput = { userId };
  if (filters.includeArchived !== "true") {
    where.isArchived = false;
  }
  if (filters.types?.length) {
    where.type = { in: filters.types as AccountType[] };
  }
  if (filters.sources?.length && wantsManual !== wantsSynced) {
    where.providerAccounts = wantsSynced ? { some: {} } : { none: {} };
  }

  const [user, accounts, transactions] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { preferredCurrency: true }
    }),
    prisma.account.findMany({
      where,
      include: {
        providerAccounts: {
          include: {
            connection: {
              select: {
                id: true,
                institutionId: true,
                institutionName: true,
                status: true,
                failureReason: true,
                requiresManualReconnect: true,
                lastSyncAt: true,
                lastSyncSuccessAt: true,
                lastSyncFailureAt: true
              }
            }
          },
          orderBy: { updatedAt: "desc" }
        }
      },
      orderBy: filters.sortBy
        ? { [filters.sortBy]: filters.sortDirection ?? "asc" }
        : { createdAt: "desc" }
    }),
    prisma.transaction.findMany({
      where: { userId },
      select: {
        accountId: true,
        transferToAccountId: true,
        type: true,
        amount: true
      }
    })
  ]);

  const accountsWithBalances = await withPreferredCurrencyBalances(
    withAccountBalances(accounts, transactions),
    user.preferredCurrency
  );

  return accountsWithBalances.map(accountListItemWithSyncSummary);
}
