import { currencyFractionDigits, type HoldingValuation } from "@flowledger/shared";
import { Prisma } from "@prisma/client";
import type {
  HoldingValuationDeps,
  HoldingValuationInput,
  ValuedHoldings
} from "../types/holdings.types.js";

const missing = (missingReason: NonNullable<HoldingValuation["missingReason"]>): HoldingValuation => ({
  source: null,
  unitPrice: null,
  priceCurrency: null,
  valuedAt: null,
  value: null,
  missingReason
});

/**
 * Values holdings in `accountCurrency`. Precedence per holding: fiat at par, then the manual price, then the market quote,
 * otherwise missing (`unsupported`, `price_unavailable`, or `rate_unavailable` when the conversion fails, even for cash).
 * Exact values are kept unrounded; the aggregate sums them and rounds once, and each holding's `value` string is its own exact
 * value rounded for display only. A missing value is `null`, never zero. Time never affects the result: there is no clock input.
 * Each distinct `(from, to)` rate is looked up once per call.
 */
export async function valueHoldings(
  holdings: HoldingValuationInput[],
  accountCurrency: string,
  { quote, rate }: HoldingValuationDeps
): Promise<ValuedHoldings> {
  const digits = currencyFractionDigits(accountCurrency);
  const rates = new Map<string, Promise<number>>();
  const rateOf = (from: string) => {
    if (from === accountCurrency) return Promise.resolve(1);
    let found = rates.get(from);
    if (!found) {
      found = rate(from, accountCurrency);
      rates.set(from, found);
    }
    return found;
  };

  const results = await Promise.all(
    holdings.map(async (holding): Promise<{ valuation: HoldingValuation; exact: Prisma.Decimal | null }> => {
      let unitPrice: Prisma.Decimal;
      let priceCurrency: string;
      let source: "cash" | "manual" | "market";
      let valuedAt: Date | null;

      if (holding.kind === "fiat") {
        [unitPrice, priceCurrency, source, valuedAt] = [new Prisma.Decimal(1), holding.code, "cash", null];
      } else if (holding.manualUnitPrice) {
        [unitPrice, priceCurrency, source, valuedAt] = [
          holding.manualUnitPrice,
          holding.manualPriceCurrency!,
          "manual",
          holding.manualPricedAt
        ];
      } else {
        const found = await quote(holding.code);
        if ("unsupported" in found) return { valuation: missing("unsupported"), exact: null };
        if ("unavailable" in found) return { valuation: missing("price_unavailable"), exact: null };
        [unitPrice, priceCurrency, source, valuedAt] = [
          new Prisma.Decimal(found.price),
          found.currency,
          "market",
          found.fetchedAt
        ];
      }

      let exact: Prisma.Decimal;
      try {
        exact = holding.quantity.times(unitPrice).times(await rateOf(priceCurrency));
      } catch {
        return { valuation: missing("rate_unavailable"), exact: null };
      }
      return {
        exact,
        valuation: {
          source,
          unitPrice: unitPrice.toFixed(),
          priceCurrency,
          valuedAt: valuedAt ? valuedAt.toISOString() : null,
          value: exact.toDecimalPlaces(digits).toFixed(digits),
          missingReason: null
        }
      };
    })
  );

  const known = results.flatMap((result) => (result.exact ? [result.exact] : []));
  return {
    valuations: results.map((result) => result.valuation),
    value: Prisma.Decimal.sum(0, ...known).toDecimalPlaces(digits),
    missingCount: results.length - known.length
  };
}
