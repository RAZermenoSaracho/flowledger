import type { Transaction } from "../types/api";

type TransactionAmountInput = Pick<Transaction, "type"> & {
  amount: unknown;
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

export function summarizeTransactions(transactions: TransactionAmountInput[]) {
  return transactions.reduce(
    (summary, transaction) => {
      const amount = parseTransactionAmount(transaction.amount);

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
