import type { QuoteStaleInput } from "../types/twelveData.types.js";

/**
 * Whether a stored security quote is stale: the latest provider attempt failed (after the last success, or with no success),
 * or, at the last successful check, the market was open yet the quote time was more than twice `refreshMinutes` older than
 * that check. A closing price while the market is closed is not stale, and elapsed time alone never makes a quote stale.
 */
export function isQuoteStale(
  { failedAt, checkedAt, quotedAt, marketOpen }: QuoteStaleInput,
  refreshMinutes: number
): boolean {
  if (failedAt && (!checkedAt || failedAt > checkedAt)) return true;
  if (checkedAt && quotedAt && marketOpen) {
    return checkedAt.getTime() - quotedAt.getTime() > 2 * refreshMinutes * 60_000;
  }
  return false;
}
