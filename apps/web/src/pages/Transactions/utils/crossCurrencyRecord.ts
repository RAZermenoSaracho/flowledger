import type { Transaction } from "../../../types/transactions.types";

/** What the detail view shows for a saved cross-currency transaction. */
export type CrossCurrencyRecord = {
  sourceAmount: string;
  sourceCurrency: string;
  targetAmount: string;
  targetCurrency: string;
  /** Target per source unit, from the persisted amounts. */
  effectiveRate: number;
  fee: { amount: string; currency: string } | null;
  /** Rate with the fee backed out; only present when a fee is recorded. */
  rateBeforeFee: number | null;
};

/** The applied amount of `transaction` and its currency, or `null` when it is single-currency. Transfers use the destination, others the account. */
function appliedSide(transaction: Transaction) {
  if (transaction.type === "transfer") {
    const currency = transaction.transferToAccount?.currency;
    if (currency && currency !== transaction.executionCurrency && transaction.destinationAmount) {
      return { amount: transaction.destinationAmount, currency };
    }
    return null;
  }
  const currency = transaction.account?.currency;
  if (currency && currency !== transaction.executionCurrency && transaction.accountAmount) {
    return { amount: transaction.accountAmount, currency };
  }
  return null;
}

/**
 * Derives the cross-currency record of a transaction, or `null` when its currencies match. Rates are
 * computed only for display (never stored): effective is target/source; with a fee in the source
 * currency the rate before fee is target/(source - fee), in the target currency (target + fee)/source.
 */
export function crossCurrencyRecord(transaction: Transaction): CrossCurrencyRecord | null {
  const side = appliedSide(transaction);
  if (!side) return null;
  const source = Number(transaction.amount);
  const target = Number(side.amount);
  if (!(source > 0)) return null;

  const fee =
    transaction.feeAmount && transaction.feeCurrency
      ? { amount: transaction.feeAmount, currency: transaction.feeCurrency }
      : null;
  let rateBeforeFee: number | null = null;
  if (fee) {
    const feeValue = Number(fee.amount);
    const denominator = fee.currency === transaction.executionCurrency ? source - feeValue : source;
    const numerator = fee.currency === transaction.executionCurrency ? target : target + feeValue;
    if (denominator > 0) rateBeforeFee = numerator / denominator;
  }

  return {
    sourceAmount: transaction.amount,
    sourceCurrency: transaction.executionCurrency,
    targetAmount: side.amount,
    targetCurrency: side.currency,
    effectiveRate: target / source,
    fee,
    rateBeforeFee
  };
}
