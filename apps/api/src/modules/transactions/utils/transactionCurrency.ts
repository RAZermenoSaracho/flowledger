import { getExchangeRate } from "../../currencies/services/read.service.js";
import { roundMoney } from "../../currencies/utils/roundMoney.js";

export async function resolveTransactionCurrencyFields(input: {
  executionCurrency: string;
  amount: number;
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
    amountInPreferredCurrency: roundMoney(input.amount * exchangeRate)
  };
}

function preferredCurrencyOrFallback(
  preferredCurrency: string | null,
  executionCurrency: string
) {
  return preferredCurrency?.trim().toUpperCase() || executionCurrency;
}
