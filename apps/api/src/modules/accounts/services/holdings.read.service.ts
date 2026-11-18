import {
  HOLDING_ACCOUNT_TYPES,
  currencyFractionDigits,
  type AccountHoldings,
  type Holding,
  type HoldingsValuation,
  type SecurityMarketQuote,
  type SecurityQuoteFailureReason
} from "@flowledger/shared";
import type { SecurityQuote } from "@prisma/client";
import { env } from "../../../config/env.js";
import { prisma } from "../../../db/prisma.js";
import { notFound } from "../../../utils/httpError.js";
import { getBinanceTickerFetchedAt } from "../../currencies/providers/binance/binance.client.js";
import { getCryptoUsdtPrice } from "../../currencies/providers/binance/services/read.service.js";
import { getExchangeRate } from "../../currencies/services/read.service.js";
import { isQuoteStale } from "../../currencies/providers/twelveData/utils/isQuoteStale.js";
import type { AccountForHoldings, HoldingQuote } from "../types/holdings.types.js";
import { valueHoldings } from "../utils/holdingValuation.js";

async function marketQuote(code: string): Promise<HoldingQuote> {
  let price: number | null;
  try {
    price = await getCryptoUsdtPrice(code);
  } catch {
    return { unavailable: true };
  }
  if (price === null) return { unsupported: true };
  return { price, currency: "USDT", fetchedAt: code === "USDT" ? null : getBinanceTickerFetchedAt() };
}

const listingKey = (symbol: string, exchange: string) => `${symbol}:${exchange}`;

/** The shared quote row of a listing as the holding's `marketQuote`; an empty quote when the listing has not been fetched yet. */
function toMarketQuote(row: SecurityQuote | undefined): SecurityMarketQuote {
  return {
    provider: "twelve_data",
    price: row?.price?.toFixed() ?? null,
    currency: row?.currency ?? null,
    quotedAt: row?.quotedAt?.toISOString() ?? null,
    checkedAt: row?.checkedAt?.toISOString() ?? null,
    stale: row ? isQuoteStale(row, env.SECURITIES_QUOTE_REFRESH_MINUTES) : false,
    failureReason: (row?.failureReason as SecurityQuoteFailureReason | null | undefined) ?? null
  };
}

/**
 * Values the holdings of every given account (one `holding.findMany` scoped by `userId`) and returns the full
 * holdings response for every investment or crypto account, including empty accounts.
 * This is the single valuation used by the account endpoints and net worth.
 */
export async function valueAccountHoldings(
  userId: string,
  accounts: AccountForHoldings[]
): Promise<Map<string, AccountHoldings>> {
  const result = new Map<string, AccountHoldings>();
  accounts = accounts.filter((account) => (HOLDING_ACCOUNT_TYPES as readonly string[]).includes(account.type));
  if (accounts.length === 0) return result;

  const rows = await prisma.holding.findMany({
    where: { userId, accountId: { in: accounts.map((account) => account.id) } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });

  const linked = rows.filter((row) => row.exchange && row.code);
  const quoteRows = linked.length
    ? await prisma.securityQuote.findMany({
        where: { OR: linked.map((row) => ({ symbol: row.code!, exchange: row.exchange! })) }
      })
    : [];
  const quotesByListing = new Map(quoteRows.map((row) => [listingKey(row.symbol, row.exchange), row]));
  const securityQuote = async (holding: { code: string | null; exchange: string | null; quoteCurrency: string | null }): Promise<HoldingQuote> => {
    const row = quotesByListing.get(listingKey(holding.code!, holding.exchange!));
    if (!row?.price || !row.currency || row.currency !== holding.quoteCurrency) return { unavailable: true };
    return { price: row.price.toFixed(), currency: row.currency, fetchedAt: row.quotedAt };
  };

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

      const valued = await valueHoldings(own, account.currency, { quote: marketQuote, securityQuote, rate });
      const holdings: Holding[] = own.map((row, index) => ({
        id: row.id,
        accountId: row.accountId,
        kind: row.kind,
        code: row.code,
        name: row.name,
        unit: row.unit,
        quantity: row.quantity.toFixed(),
        manualUnitPrice: row.manualUnitPrice?.toFixed() ?? null,
        manualPriceCurrency: row.manualPriceCurrency,
        manualPricedAt: row.manualPricedAt?.toISOString() ?? null,
        exchange: row.exchange,
        quoteCurrency: row.quoteCurrency,
        marketQuote: row.exchange && row.code ? toMarketQuote(quotesByListing.get(listingKey(row.code, row.exchange))) : null,
        valuation: valued.valuations[index]!
      }));
      result.set(account.id, {
        accountId: account.id,
        holdings,
        valuation: {
          currency: account.currency,
          value: valued.value.toFixed(currencyFractionDigits(account.currency)),
          status: own.length === 0 ? "empty" : valued.missingCount > 0 ? "partial" : "complete",
          missingCount: valued.missingCount,
          holdingCount: own.length
        }
      });
    })
  );
  return result;
}

/** Aggregates for the given accounts, keyed by account id, with `null` for non-holding account types. */
export async function valueHoldingsForAccounts(
  userId: string,
  accounts: AccountForHoldings[]
): Promise<Map<string, HoldingsValuation | null>> {
  const valued = await valueAccountHoldings(userId, accounts);
  return new Map(accounts.map((account) => [account.id, valued.get(account.id)?.valuation ?? null]));
}

/** Returns one account's holdings with valuations and aggregate; 404 when the account is not the user's. An account with no holdings gets an empty list and a zero empty aggregate. */
export async function getAccountHoldings(userId: string, accountId: string): Promise<AccountHoldings> {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
    select: { id: true, currency: true, type: true }
  });
  if (!account) throw notFound("Account");

  const valued = await valueAccountHoldings(userId, [account]);
  return valued.get(account.id) ?? {
    accountId: account.id,
    holdings: [],
    valuation: {
      currency: account.currency,
      value: (0).toFixed(currencyFractionDigits(account.currency)),
      status: "empty",
      missingCount: 0,
      holdingCount: 0
    }
  };
}
