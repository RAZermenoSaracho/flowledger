import { Prisma } from "@prisma/client";
import { getExchangeRate } from "../../currencies/services/read.service.js";
import { roundMoney } from "../../currencies/utils/roundMoney.js";

/** Looks up the execution-to-preferred rate and values `amount` (a decimal string, number or Decimal) in the preferred currency; valuation only, never used for native balances. */
export async function resolveTransactionCurrencyFields(input: {
  executionCurrency: string;
  amount: Prisma.Decimal.Value;
  preferredCurrency: string | null;
}) {
  const executionCurrency = input.executionCurrency.trim().toUpperCase();
  const preferredCurrency = preferredCurrencyOrFallback(
    input.preferredCurrency,
    executionCurrency
  );
  const exchangeRate = await getExchangeRate(executionCurrency, preferredCurrency);

  return {
    executionCurrency,
    exchangeRate,
    amountInPreferredCurrency: roundMoney(new Prisma.Decimal(input.amount).toNumber() * exchangeRate)
  };
}

function preferredCurrencyOrFallback(
  preferredCurrency: string | null,
  executionCurrency: string
) {
  return preferredCurrency?.trim().toUpperCase() || executionCurrency;
}
