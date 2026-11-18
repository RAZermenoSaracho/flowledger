import { prisma } from "../../../../../db/prisma.js";
import { env } from "../../../../../config/env.js";
import { fetchQuote, TwelveDataError } from "../twelveData.client.js";
import type { SecurityListing } from "../types/twelveData.types.js";
import { markMinuteExhausted, nextDayStart, nextMinuteStart, reserveCredits } from "./credits.service.js";

const MINUTE_MS = 60_000;
const LEASE_MS = 2 * MINUTE_MS;
const DAY_MS = 24 * 60 * MINUTE_MS;
const BACKOFF_BASE_MS = 15 * MINUTE_MS;
const BACKOFF_MAX_MS = 6 * 60 * MINUTE_MS;

/** Next attempt after a failure: rate limits wait for the next minute or UTC day, permanent-looking ones 24 h, the rest back off from 15 min to 6 h. */
function nextAttemptAfter(reason: string, previousFailures: number, now: Date): Date {
  if (reason === "rate_limited") return nextMinuteStart(now);
  if (reason === "quota_exhausted") return nextDayStart(now);
  if (reason === "plan_restricted" || reason === "not_found" || reason === "invalid_quote" || reason === "currency_mismatch") {
    return new Date(now.getTime() + DAY_MS);
  }
  return new Date(now.getTime() + Math.min(BACKOFF_BASE_MS * 2 ** previousFailures, BACKOFF_MAX_MS));
}

/** Records a failed attempt without touching the stored price, currency, `quotedAt` or `checkedAt`. */
async function recordFailure(listing: SecurityListing, reason: string, now: Date): Promise<void> {
  const row = await prisma.securityQuote.findUnique({
    where: { symbol_exchange: { symbol: listing.symbol, exchange: listing.exchange } },
    select: { failureCount: true }
  });
  await prisma.securityQuote.update({
    where: { symbol_exchange: { symbol: listing.symbol, exchange: listing.exchange } },
    data: {
      failedAt: now,
      failureReason: reason,
      failureCount: { increment: 1 },
      nextAttemptAt: nextAttemptAfter(reason, row?.failureCount ?? 0, now)
    }
  });
}

/**
 * Refreshes the shared quote of each given listing, sequentially and at most one provider call per listing.
 * A listing is skipped unless its row is due (`nextAttemptAt <= now`); the atomic claim moves `nextAttemptAt` two minutes
 * ahead, so concurrent callers in any process skip it. Each call first reserves a credit; a full minute budget releases the
 * claim and stops the whole pass, a full day budget records `quota_exhausted`. A success stores price, quote time, market state
 * and the next attempt (refresh interval while open, closed recheck while closed); a failure only records the reason and
 * cooldown. A quote in a currency other than the holding's `quoteCurrency` is a `currency_mismatch` failure and is not stored.
 * No-op without `TWELVE_DATA_API_KEY`. Never throws for provider failures.
 */
export async function refreshSecurityQuotes(listings: SecurityListing[]): Promise<void> {
  if (!env.TWELVE_DATA_API_KEY) return;
  const unique = new Map(listings.map((listing) => [`${listing.symbol}:${listing.exchange}`, listing]));

  for (const listing of unique.values()) {
    const now = new Date();
    const where = { symbol: listing.symbol, exchange: listing.exchange };
    await prisma.securityQuote.createMany({ data: [{ ...where, nextAttemptAt: now }], skipDuplicates: true });
    const claimed = await prisma.securityQuote.updateMany({
      where: { ...where, nextAttemptAt: { lte: now } },
      data: { nextAttemptAt: new Date(now.getTime() + LEASE_MS) }
    });
    if (claimed.count !== 1) continue;

    const reservation = await reserveCredits(1, now);
    if (reservation === "minute_full") {
      await prisma.securityQuote.updateMany({ where, data: { nextAttemptAt: nextMinuteStart(now) } });
      return;
    }
    if (reservation === "day_full") {
      await recordFailure(listing, "quota_exhausted", now);
      continue;
    }

    try {
      const quote = await fetchQuote(listing.symbol, listing.exchange);
      if (listing.quoteCurrency && quote.currency !== listing.quoteCurrency) {
        await recordFailure(listing, "currency_mismatch", now);
        continue;
      }
      const intervalMinutes = quote.marketOpen ? env.SECURITIES_QUOTE_REFRESH_MINUTES : env.SECURITIES_QUOTE_CLOSED_RECHECK_MINUTES;
      await prisma.securityQuote.update({
        where: { symbol_exchange: where },
        data: {
          currency: quote.currency,
          price: quote.price,
          quotedAt: quote.quotedAt,
          checkedAt: now,
          marketOpen: quote.marketOpen,
          failedAt: null,
          failureReason: null,
          failureCount: 0,
          nextAttemptAt: new Date(now.getTime() + intervalMinutes * MINUTE_MS)
        }
      });
    } catch (error) {
      if (!(error instanceof TwelveDataError)) throw error;
      await recordFailure(listing, error.reason, now);
      if (error.reason === "rate_limited") await markMinuteExhausted(now);
      if (error.reason === "rate_limited" || error.reason === "quota_exhausted") return;
    }
  }
}
