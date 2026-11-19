import type { HoldingKind, HoldingValuation } from "@flowledger/shared";
import type { Prisma } from "@prisma/client";

/** The stored fields of a holding that valuation reads. */
export interface HoldingValuationInput {
  id: string;
  kind: HoldingKind;
  code: string | null;
  quantity: Prisma.Decimal;
  manualUnitPrice: Prisma.Decimal | null;
  manualPriceCurrency: string | null;
  manualPricedAt: Date | null;
  exchange: string | null;
  quoteCurrency: string | null;
}

/** Outcome of a market quotation lookup: a price, a code the provider does not quote, or no usable price data. */
export type HoldingQuote =
  | { price: number | string; currency: string; fetchedAt: Date | null }
  | { unsupported: true }
  | { unavailable: true };

/** Injected lookups for `valueHoldings`: the market quotation for a crypto code, the stored quote of a linked listing, and the rate `1 from = rate to` (throws when unavailable). */
export interface HoldingValuationDeps {
  quote: (code: string) => Promise<HoldingQuote>;
  /** The stored quote of a provider-linked stock/ETF holding's listing; `unavailable` when it has no usable price. */
  securityQuote: (holding: HoldingValuationInput) => Promise<HoldingQuote>;
  rate: (from: string, to: string) => Promise<number>;
}

/** Result of `valueHoldings`: one valuation per input holding (same order) and the account-currency aggregate. */
export interface ValuedHoldings {
  valuations: HoldingValuation[];
  /** Exact sum of the known holding values, rounded once to the account currency's minor units. */
  value: Prisma.Decimal;
  missingCount: number;
}

/** Account identity and type used to select holdings-based valuation. */
export interface AccountForHoldings {
  id: string;
  currency: string;
  type: string;
}

/** Stored holding fields required to validate an update. */
export type ExistingHolding = Pick<Prisma.HoldingGetPayload<object>, "id" | "kind" | "code" | "manualUnitPrice" | "exchange" | "quoteCurrency">;

/** What makes two holdings of one account the same instrument; `exchange` is null for every unlinked holding. */
export interface HoldingIdentity {
  kind: HoldingKind;
  code: string;
  exchange: string | null;
}
