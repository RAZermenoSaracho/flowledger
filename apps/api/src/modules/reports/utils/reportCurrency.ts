import { Prisma } from "@prisma/client";
import { getExchangeRate } from "../../currencies/services/read.service.js";
import { valueInCurrency } from "../../currencies/utils/valuation.js";

/** Values a transaction amount in `to` at the live rate, half-up to `to`'s minor units; exact `Decimal`. */
export async function convertAmount(
  amount: Prisma.Decimal,
  from: string,
  to: string
): Promise<Prisma.Decimal> {
  if (from === to || amount.isZero()) return amount;

  return valueInCurrency(amount, await getExchangeRate(from, to), to);
}
