import type { SecurityQuoteFailureReason } from "@flowledger/shared";

/** One raw `/symbol_search` entry, with only the fields FlowLedger reads. */
export interface TwelveDataSymbol {
  symbol: string;
  instrument_name: string;
  exchange: string;
  mic_code: string;
  country: string;
  currency: string;
  instrument_type: string;
}

/** A valid `/quote` response: `price` stays a decimal string, `quotedAt` is the provider's last-quote (else bar) time. */
export interface TwelveDataQuote {
  price: string;
  currency: string;
  quotedAt: Date;
  marketOpen: boolean;
}

/** A stock/ETF listing to quote: its ticker, ISO 10383 MIC and the currency the holding expects. */
export interface SecurityListing {
  symbol: string;
  exchange: string;
  quoteCurrency: string | null;
}

/** Outcome of reserving one provider credit: reserved, or which window is full. */
export type CreditReservation = "reserved" | "minute_full" | "day_full";

/** Inputs of `isQuoteStale`. */
export interface QuoteStaleInput {
  failedAt: Date | null;
  checkedAt: Date | null;
  quotedAt: Date | null;
  marketOpen: boolean | null;
}

/** Failure reasons that a provider call can produce. */
export type TwelveDataFailureReason = SecurityQuoteFailureReason;
