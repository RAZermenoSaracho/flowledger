import type { Transaction } from "../../../types/transactions.types";
import { add, compare, divideToSignificant, subtract } from "../../../utils/money";

/** What the detail view shows for a saved cross-currency transaction. */
export type CrossCurrencyRecord = {
  sourceAmount: string;
  sourceCurrency: string;
  targetAmount: string;
  targetCurrency: string;
  /** Target per source unit, from the persisted amounts. */
  effectiveRate: string;
  fee: { amount: string; currency: string } | null;
  /** Rate with the fee backed out; only present when a fee is recorded. */
  rateBeforeFee: string | null;
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
  const effectiveRate = divideToSignificant(side.amount, transaction.amount);
  if (effectiveRate === null) return null;

  const fee =
    transaction.feeAmount && transaction.feeCurrency
      ? { amount: transaction.feeAmount, currency: transaction.feeCurrency }
      : null;
  let rateBeforeFee: string | null = null;
  if (fee) {
    const inSource = fee.currency === transaction.executionCurrency;
    const sourceCurrency = transaction.executionCurrency;
    const sourceAfterFee =
      inSource && compare(transaction.amount, fee.amount, sourceCurrency) > 0
        ? subtract(transaction.amount, fee.amount, sourceCurrency)
        : null;
    if (inSource ? sourceAfterFee !== null : true) {
      rateBeforeFee = divideToSignificant(
        inSource ? side.amount : add(side.amount, fee.amount, fee.currency),
        inSource ? sourceAfterFee! : transaction.amount
      );
    }
  }

  return {
    sourceAmount: transaction.amount,
    sourceCurrency: transaction.executionCurrency,
    targetAmount: side.amount,
    targetCurrency: side.currency,
    effectiveRate,
    fee,
    rateBeforeFee
  };
}
