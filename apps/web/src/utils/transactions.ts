import type { Transaction } from "../types/api";

type TransactionAmountInput = Pick<Transaction, "type"> & {
  amount: unknown;
};

type TransactionSummaryInput = Pick<Transaction, "type"> & {
  amountInPreferredCurrency: unknown;
};

export function parseTransactionAmount(amount: unknown) {
  if (typeof amount === "number") {
    return Number.isFinite(amount) ? amount : 0;
  }

  if (typeof amount === "string") {
    const parsedAmount = Number(amount.trim());
    return Number.isFinite(parsedAmount) ? parsedAmount : 0;
  }

  return 0;
}

// Sums amountInPreferredCurrency (not the raw amount) so totals stay
// meaningful across transactions executed in different currencies.
export function summarizeTransactions(transactions: TransactionSummaryInput[]) {
  return transactions.reduce(
    (summary, transaction) => {
      const amount = parseTransactionAmount(
        transaction.amountInPreferredCurrency
      );

      if (transaction.type === "income") {
        summary.income += amount;
      }
      if (transaction.type === "expense") {
        summary.expenses += amount;
      }

      return summary;
    },
    { income: 0, expenses: 0 }
  );
}
