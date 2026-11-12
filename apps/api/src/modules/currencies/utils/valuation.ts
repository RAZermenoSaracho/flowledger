import { currencyFractionDigits } from "@flowledger/shared";
import { Prisma } from "@prisma/client";

/** Values a native `amount` in `currency` at `rate`, rounded half-up to that currency's minor units; returns an exact `Decimal` (call `.toNumber()` only at the response boundary). */
export function valueInCurrency(amount: Prisma.Decimal.Value, rate: Prisma.Decimal.Value, currency: string) {
  return new Prisma.Decimal(amount).times(rate).toDecimalPlaces(currencyFractionDigits(currency));
}
