import assert from "node:assert/strict";
import {
  calculateAccountBalance,
  calculateMonthlyCashflow
} from "../src/modules/transactions/transactionCalculations.ts";

const amount = (value: number) => ({ toNumber: () => value });

const accountTransactions = [
  {
    accountId: "checking",
    transferToAccountId: null,
    type: "income" as const,
    amount: amount(1000)
  },
  {
    accountId: "checking",
    transferToAccountId: null,
    type: "expense" as const,
    amount: amount(150)
  },
  {
    accountId: "checking",
    transferToAccountId: "savings",
    type: "transfer" as const,
    amount: amount(200)
  },
  {
    accountId: "cash",
    transferToAccountId: "checking",
    type: "transfer" as const,
    amount: amount(50)
  }
];

assert.equal(calculateAccountBalance("checking", accountTransactions), 700);
assert.equal(
  calculateAccountBalance("checking", accountTransactions, amount(25)),
  725
);
assert.equal(calculateAccountBalance("savings", accountTransactions), 200);
assert.equal(calculateAccountBalance("cash", accountTransactions), -50);

const cashflow = calculateMonthlyCashflow([
  {
    date: new Date("2026-06-01T00:00:00.000Z"),
    type: "income" as const,
    amount: amount(1000),
    categoryId: "salary"
  },
  {
    date: new Date("2026-06-02T00:00:00.000Z"),
    type: "expense" as const,
    amount: amount(250),
    categoryId: "food"
  },
  {
    date: new Date("2026-06-03T00:00:00.000Z"),
    type: "income" as const,
    amount: amount(25),
    categoryId: "settlement",
    expenseOffsetCategoryId: "food"
  },
  {
    date: new Date("2026-06-04T00:00:00.000Z"),
    type: "expense" as const,
    amount: amount(25),
    categoryId: "settlement"
  },
  {
    date: new Date("2026-06-05T00:00:00.000Z"),
    type: "transfer" as const,
    amount: amount(9999),
    categoryId: null,
    expenseOffsetCategoryId: null
  }
]);

assert.deepEqual(cashflow, [
  {
    month: "2026-06",
    income: 1025,
    expenses: 275,
    grossExpenses: 275,
    expenseReimbursements: 25,
    netExpenses: 250,
    grossIncome: 1025,
    incomeOffsets: 25,
    netIncome: 1000,
    balance: 750
  }
]);

const foodCashflow = calculateMonthlyCashflow(
  [
    {
      date: new Date("2026-06-02T00:00:00.000Z"),
      type: "expense" as const,
      amount: amount(250),
      categoryId: "food"
    },
    {
      date: new Date("2026-06-03T00:00:00.000Z"),
      type: "income" as const,
      amount: amount(25),
      categoryId: "settlement",
      expenseOffsetCategoryId: "food"
    },
    {
      date: new Date("2026-06-05T00:00:00.000Z"),
      type: "transfer" as const,
      amount: amount(9999),
      categoryId: null,
      expenseOffsetCategoryId: null
    }
  ],
  { categoryId: "food" }
);

assert.deepEqual(foodCashflow, [
  {
    month: "2026-06",
    income: 0,
    expenses: 250,
    grossExpenses: 250,
    expenseReimbursements: 25,
    netExpenses: 225,
    grossIncome: 0,
    incomeOffsets: 0,
    netIncome: 0,
    balance: -250
  }
]);

const multiCategoryCashflow = calculateMonthlyCashflow(
  [
    {
      date: new Date("2026-06-01T00:00:00.000Z"),
      type: "income" as const,
      amount: amount(1000),
      categoryId: "salary"
    },
    {
      date: new Date("2026-06-02T00:00:00.000Z"),
      type: "expense" as const,
      amount: amount(250),
      categoryId: "food"
    },
    {
      date: new Date("2026-06-03T00:00:00.000Z"),
      type: "income" as const,
      amount: amount(25),
      categoryId: "settlement",
      expenseOffsetCategoryId: "food"
    },
    {
      date: new Date("2026-06-04T00:00:00.000Z"),
      type: "expense" as const,
      amount: amount(25),
      categoryId: "settlement"
    }
  ],
  { categoryIds: ["food", "settlement"] }
);

assert.deepEqual(multiCategoryCashflow, [
  {
    month: "2026-06",
    income: 25,
    expenses: 275,
    grossExpenses: 275,
    expenseReimbursements: 25,
    netExpenses: 250,
    grossIncome: 25,
    incomeOffsets: 25,
    netIncome: 0,
    balance: -250
  }
]);
