import type { Prisma } from "@prisma/client";
import { getExchangeRate } from "../../currencies/services/read.service.js";
import { roundMoney } from "../../currencies/utils/roundMoney.js";

/** Converts a transaction amount between currencies via the live exchange rate, rounded to money precision. */
export async function convertAmount(
  amount: Prisma.Decimal,
  from: string,
  to: string
): Promise<number> {
  const value = amount.toNumber();
  if (from === to || value === 0) return value;

  const rate = await getExchangeRate(from, to);
  return roundMoney(value * rate);
}
