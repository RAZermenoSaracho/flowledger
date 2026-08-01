import assert from "node:assert/strict";
import {
  parseTransactionAmount,
  summarizeTransactions
} from "../src/pages/Transactions/utils/transactions.ts";

const unfilteredTransactions = [
  { type: "income" as const, amount: "1000.25" },
  { type: "expense" as const, amount: "125.75" },
  { type: "expense" as const, amount: 50 },
  {
    type: "expense" as const,
    amount: "25",
    settlementRole: "debtor"
  },
  {
    type: "income" as const,
    amount: "25",
    settlementRole: "creditor"
  },
  {
    type: "income" as const,
    amount: "10.5",
    expenseOffsetCategoryId: "category-expense-offset"
  },
  { type: "transfer" as const, amount: "9999" }
];

const unfilteredSummary = summarizeTransactions(unfilteredTransactions);
assert.deepEqual(unfilteredSummary, {
  income: 1035.75,
  expenses: 200.75
});
assert.equal(unfilteredSummary.income - unfilteredSummary.expenses, 835);

const settlementSummary = summarizeTransactions(
  unfilteredTransactions.filter((transaction) => "settlementRole" in transaction)
);
assert.deepEqual(settlementSummary, {
  income: 25,
  expenses: 25
});

const offsetSummary = summarizeTransactions(
  unfilteredTransactions.filter(
    (transaction) => "expenseOffsetCategoryId" in transaction
  )
);
assert.deepEqual(offsetSummary, {
  income: 10.5,
  expenses: 0
});

const filteredSummary = summarizeTransactions(
  unfilteredTransactions.filter((transaction) => transaction.type === "expense")
);
assert.deepEqual(filteredSummary, {
  income: 0,
  expenses: 200.75
});

assert.equal(parseTransactionAmount(""), 0);
assert.equal(parseTransactionAmount("not-a-number"), 0);
assert.equal(parseTransactionAmount(Number.POSITIVE_INFINITY), 0);
