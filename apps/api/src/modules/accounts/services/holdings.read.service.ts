import { currencyFractionDigits, type AccountHoldings, type Holding, type HoldingsValuation } from "@flowledger/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { notFound } from "../../../utils/httpError.js";
import { getBinanceTickerFetchedAt } from "../../currencies/providers/binance/binance.client.js";
import { getCryptoUsdtPrice } from "../../currencies/providers/binance/services/read.service.js";
import { getExchangeRate } from "../../currencies/services/read.service.js";
import { calculateAccountBalance } from "../../transactions/utils/transactionCalculations.js";
import type { HoldingQuote } from "../types/holdings.types.js";
import { valueHoldings } from "../utils/holdingValuation.js";

async function marketQuote(code: string): Promise<HoldingQuote> {
  let price: number | null;
  try {
    price = await getCryptoUsdtPrice(code);
  } catch {
    return { unavailable: true };
  }
  if (price === null) return { unsupported: true };
  return { price, currency: "USDT", fetchedAt: getBinanceTickerFetchedAt() };
}

type AccountForHoldings = { id: string; currency: string; currentBalance: Prisma.Decimal };

/**
 * Values the holdings of every given account (one `holding.findMany` scoped by `userId`) and returns the full
 * holdings response for each account that has any; accounts without holdings are absent from the map.
 * `netDeposited` is the account's `currentBalance`. This is the single valuation used by the account endpoints and net worth.
 */
export async function valueAccountHoldings(
  userId: string,
  accounts: AccountForHoldings[]
): Promise<Map<string, AccountHoldings>> {
  const result = new Map<string, AccountHoldings>();
  if (accounts.length === 0) return result;

  const rows = await prisma.holding.findMany({
    where: { userId, accountId: { in: accounts.map((account) => account.id) } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });

  const rates = new Map<string, Promise<number>>();
  const rate = (from: string, to: string) => {
    const key = `${from}>${to}`;
    let found = rates.get(key);
    if (!found) {
      found = getExchangeRate(from, to);
      rates.set(key, found);
    }
    return found;
  };

  await Promise.all(
    accounts.map(async (account) => {
      const own = rows.filter((row) => row.accountId === account.id);
      if (own.length === 0) return;

      const valued = await valueHoldings(own, account.currency, { quote: marketQuote, rate });
      const holdings: Holding[] = own.map((row, index) => ({
        id: row.id,
        accountId: row.accountId,
        kind: row.kind,
        code: row.code,
        quantity: row.quantity.toFixed(),
        manualUnitPrice: row.manualUnitPrice?.toFixed() ?? null,
        manualPriceCurrency: row.manualPriceCurrency,
        manualPricedAt: row.manualPricedAt?.toISOString() ?? null,
        valuation: valued.valuations[index]!
      }));
      result.set(account.id, {
        accountId: account.id,
        holdings,
        valuation: {
          currency: account.currency,
          value: valued.value.toFixed(currencyFractionDigits(account.currency)),
          status: valued.missingCount > 0 ? "partial" : "complete",
          missingCount: valued.missingCount,
          netDeposited: account.currentBalance.toFixed()
        }
      });
    })
  );
  return result;
}

/** Aggregates for the given accounts, keyed by account id, with `null` for accounts that have no holdings. */
export async function valueHoldingsForAccounts(
  userId: string,
  accounts: AccountForHoldings[]
): Promise<Map<string, HoldingsValuation | null>> {
  const valued = await valueAccountHoldings(userId, accounts);
  return new Map(accounts.map((account) => [account.id, valued.get(account.id)?.valuation ?? null]));
}

/** Returns one account's holdings with valuations and aggregate; 404 when the account is not the user's. An account with no holdings gets an empty list and a zero complete aggregate. */
export async function getAccountHoldings(userId: string, accountId: string): Promise<AccountHoldings> {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
    select: { id: true, currency: true, initialBalance: true }
  });
  if (!account) throw notFound("Account");

  const transactions = await prisma.transaction.findMany({
    where: { userId, OR: [{ accountId }, { transferToAccountId: accountId }] },
    select: {
      accountId: true,
      transferToAccountId: true,
      type: true,
      accountAmount: true,
      destinationAmount: true
    }
  });
  const currentBalance = calculateAccountBalance(account.id, transactions, account.initialBalance);

  const valued = await valueAccountHoldings(userId, [{ ...account, currentBalance }]);
  return (
    valued.get(account.id) ?? {
      accountId: account.id,
      holdings: [],
      valuation: {
        currency: account.currency,
        value: (0).toFixed(currencyFractionDigits(account.currency)),
        status: "complete",
        missingCount: 0,
        netDeposited: currentBalance.toFixed()
      }
    }
  );
}
