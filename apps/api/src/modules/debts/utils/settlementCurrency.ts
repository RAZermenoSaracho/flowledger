import type { Prisma } from "@prisma/client";
import { getExchangeRate } from "../../currencies/services/read.service.js";
import { roundMoney } from "../../currencies/utils/roundMoney.js";

// Converts a debt's fixed original-currency amount into another currency
// using the live rate at settlement time (Milestone 10) — never the rate
// captured when the debt was created.
export async function convertSettlementAmount(
  amount: Prisma.Decimal,
  fromCurrency: string,
  toCurrency: string
) {
  if (fromCurrency === toCurrency) return amount.toNumber();
  const rate = await getExchangeRate(fromCurrency, toCurrency);
  return roundMoney(amount.toNumber() * rate);
}
