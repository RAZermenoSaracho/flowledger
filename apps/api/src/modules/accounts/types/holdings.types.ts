import type { HoldingKind, HoldingValuation } from "@flowledger/shared";
import type { Prisma } from "@prisma/client";

/** The stored fields of a holding that valuation reads. */
export interface HoldingValuationInput {
  id: string;
  kind: HoldingKind;
  code: string;
  quantity: Prisma.Decimal;
  manualUnitPrice: Prisma.Decimal | null;
  manualPriceCurrency: string | null;
  manualPricedAt: Date | null;
}

/** Outcome of a market quotation lookup: a price, a code the provider does not quote, or no usable price data. */
export type HoldingQuote =
  | { price: number; currency: string; fetchedAt: Date | null }
  | { unsupported: true }
  | { unavailable: true };

/** Injected lookups for `valueHoldings`: the market quotation for a crypto code, and the rate `1 from = rate to` (throws when unavailable). */
export interface HoldingValuationDeps {
  quote: (code: string) => Promise<HoldingQuote>;
  rate: (from: string, to: string) => Promise<number>;
}

/** Result of `valueHoldings`: one valuation per input holding (same order) and the account-currency aggregate. */
export interface ValuedHoldings {
  valuations: HoldingValuation[];
  /** Exact sum of the known holding values, rounded once to the account currency's minor units. */
  value: Prisma.Decimal;
  missingCount: number;
}
