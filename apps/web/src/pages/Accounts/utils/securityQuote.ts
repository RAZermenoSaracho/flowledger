import type {
  SecurityMarketQuote,
  SecurityQuoteFailureReason
} from "@flowledger/shared";

const FAILURE_TEXT: Record<SecurityQuoteFailureReason, string> = {
  rate_limited: "Price provider is busy; it will retry shortly",
  quota_exhausted: "Daily price limit reached; it will retry tomorrow",
  plan_restricted: "This exchange is not covered by the price provider",
  not_found: "The price provider does not know this listing",
  invalid_quote: "The price provider returned unusable data",
  currency_mismatch: "The quote currency did not match the listing",
  unavailable: "The price provider could not be reached"
};

/** Short English reason a quote is stale: the latest failure when there is one, otherwise an out-of-date quote from an open market. */
export function staleReasonText(quote: SecurityMarketQuote): string {
  return quote.failureReason
    ? FAILURE_TEXT[quote.failureReason]
    : "The latest quote is older than expected";
}
