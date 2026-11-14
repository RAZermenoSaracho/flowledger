import { Prisma } from "@prisma/client";
import type { WhereInput } from "datasieve";
import { prisma } from "../../../db/prisma.js";
import { createSieve } from "../../../db/sieve.js";
import type { RawWhereNode } from "../../../db/sieve.types.js";
import { parseQueryParam } from "../../../utils/parseQueryParam.js";
import { getExchangeRate } from "../../currencies/services/read.service.js";
import { valueInCurrency } from "../../currencies/utils/valuation.js";
import { withAccountBalances } from "../../transactions/utils/transactionCalculations.js";
import { accountListItemWithSyncSummary } from "../utils/accountSyncSummary.js";
import type { AccountListRecord, AccountsQueryInput } from "../types/accounts.types.js";

const accountsSieve = createSieve(prisma.account);

const accountInclude = {
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
    sort: [{ field: "updatedAt", direction: "desc" as const }]
  }
} as const;

async function withPreferredCurrencyBalances<
  TAccount extends { currency: string; currentBalance: Prisma.Decimal }
>(accounts: TAccount[], preferredCurrency: string | null) {
  return Promise.all(
    accounts.map(async (account) => {
      if (!preferredCurrency || account.currency === preferredCurrency) {
        return {
          ...account,
          currentBalanceInPreferredCurrency: account.currentBalance.toNumber()
        };
      }

      const rate = await getExchangeRate(account.currency, preferredCurrency);
      return {
        ...account,
        currentBalanceInPreferredCurrency: valueInCurrency(
          account.currentBalance,
          rate,
          preferredCurrency
        ).toNumber()
      };
    })
  );
}

// "source" ("manual" | "synced") isn't a real Account column — it's
// whether the account has any linked ProviderAccount, which DSQL can't
// express directly: `exists`/`notExists` only ever compile to an *empty*
// `{some:{}}`/`{none:{}}` (see @razsdev/datasieve-prisma's translate/where.ts),
// and the frontend's Operator type deliberately excludes exists/notExists
// entirely (they're relation-only, no UI for them). So the frontend sends
// ordinary enum conditions on a virtual "source" field, and this rewrites
// each one, wherever it appears in the tree, into the real
// providerAccounts exists/notExists condition it means — same pattern as
// transactions' classification/transactionFilterType virtual fields.
function sourceCondition(
  op: string,
  value: unknown
): WhereInput<AccountListRecord> {
  const values = Array.isArray(value) ? value : [value];
  const wantsSynced = values.includes("synced");
  const wantsManual = values.includes("manual");
  const matchesSynced = op === "!=" || op === "notIn" ? !wantsSynced : wantsSynced;
  const matchesManual = op === "!=" || op === "notIn" ? !wantsManual : wantsManual;

  if (matchesSynced && matchesManual) {
    // Both sources match: an unconstrained (always-true) condition.
    return { field: "id", op: "isNotNull" };
  }
  if (matchesSynced) {
    return { field: "providerAccounts", op: "exists" };
  }
  if (matchesManual) {
    return { field: "providerAccounts", op: "notExists" };
  }
  // Neither source matches: an unsatisfiable condition.
  return { field: "id", op: "isNull" };
}

function expandVirtualConditions(
  node: RawWhereNode | undefined
): WhereInput<AccountListRecord> | undefined {
  if (!node) return undefined;

  if ("and" in node) {
    return {
      and: node.and
        .map((child) => expandVirtualConditions(child))
        .filter((child) => child !== undefined)
    };
  }
  if ("or" in node) {
    return {
      or: node.or
        .map((child) => expandVirtualConditions(child))
        .filter((child) => child !== undefined)
    };
  }
  if ("not" in node) {
    const inner = expandVirtualConditions(node.not);
    return inner ? { not: inner } : undefined;
  }

  if (node.field === "source") {
    return sourceCondition(node.op, node.value);
  }

  return node as WhereInput<AccountListRecord>;
}

/** Lists a user's accounts per a DSQL query, enriched with computed balances (in both native and preferred currency) and provider sync summaries. */
export async function listAccounts(userId: string, rawQuery: string | undefined) {
  const input = parseQueryParam<AccountsQueryInput>(rawQuery, "accounts");
  const expandedWhere = expandVirtualConditions(input.where);
  const userCondition: WhereInput<AccountListRecord> = {
    field: "userId",
    op: "=",
    value: userId
  };
  const where = expandedWhere
    ? { and: [userCondition, expandedWhere] }
    : userCondition;

  const [user, accountsResult, transactions] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { preferredCurrency: true }
    }),
    accountsSieve.query<AccountListRecord>({
      where,
      sort: input.sort ?? [{ field: "createdAt", direction: "desc" }],
      include: accountInclude
    }),
    prisma.transaction.findMany({
      where: { userId },
      select: {
        accountId: true,
        transferToAccountId: true,
        type: true,
        accountAmount: true,
        destinationAmount: true
      }
    })
  ]);

  const accountsWithBalances = await withPreferredCurrencyBalances(
    withAccountBalances(accountsResult.data, transactions),
    user.preferredCurrency
  );

  return accountsWithBalances.map(accountListItemWithSyncSummary);
}
