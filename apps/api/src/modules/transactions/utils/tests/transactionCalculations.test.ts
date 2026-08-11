import { describe, expect, it } from "vitest";
import {
  calculateAccountBalance,
  calculateMonthlyCashflow,
  withAccountBalances
} from "../transactionCalculations.js";

const amount = (value: number) => ({ toNumber: () => value });

describe("calculateAccountBalance", () => {
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

  it("adds income and subtracts expense/outgoing transfers for the matching account", () => {
    expect(calculateAccountBalance("checking", accountTransactions)).toBe(700);
  });

  it("adds an optional initialBalance (duck-typed via .toNumber())", () => {
    expect(
      calculateAccountBalance("checking", accountTransactions, amount(25))
    ).toBe(725);
  });

  it("credits the destination account for an incoming transfer", () => {
    expect(calculateAccountBalance("savings", accountTransactions)).toBe(200);
  });

  it("debits the source account for an outgoing transfer", () => {
    expect(calculateAccountBalance("cash", accountTransactions)).toBe(-50);
  });

  it("returns the initial balance alone for an account with no transactions", () => {
    expect(
      calculateAccountBalance("unused", accountTransactions, amount(10))
    ).toBe(10);
  });

  it("accepts a plain number amount, not just a Decimal-like object", () => {
    expect(
      calculateAccountBalance("checking", [
        { accountId: "checking", type: "income", amount: 50 }
      ])
    ).toBe(50);
  });
});

describe("withAccountBalances", () => {
  it("attaches a currentBalance to each account", () => {
    const accounts = [
      { id: "checking", initialBalance: 100 },
      { id: "savings" }
    ];
    const transactions = [
      { accountId: "checking", type: "income" as const, amount: 50 }
    ];

    expect(withAccountBalances(accounts, transactions)).toEqual([
      { id: "checking", initialBalance: 100, currentBalance: 150 },
      { id: "savings", currentBalance: 0 }
    ]);
  });
});

describe("calculateMonthlyCashflow", () => {
  it("aggregates income/expenses/offsets by month, excluding transfers", () => {
    const cashflow = calculateMonthlyCashflow([
      {
        date: new Date("2026-06-01T00:00:00.000Z"),
        type: "income",
        amount: amount(1000),
        categoryId: "salary"
      },
      {
        date: new Date("2026-06-02T00:00:00.000Z"),
        type: "expense",
        amount: amount(250),
        categoryId: "food"
      },
      {
        date: new Date("2026-06-03T00:00:00.000Z"),
        type: "income",
        amount: amount(25),
        categoryId: "settlement",
        expenseOffsetCategoryId: "food"
      },
      {
        date: new Date("2026-06-04T00:00:00.000Z"),
        type: "expense",
        amount: amount(25),
        categoryId: "settlement"
      },
      {
        date: new Date("2026-06-05T00:00:00.000Z"),
        type: "transfer",
        amount: amount(9999),
        categoryId: null,
        expenseOffsetCategoryId: null
      }
    ]);

    expect(cashflow).toEqual([
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
  });

  it("filters to a single category, still counting matching expense offsets", () => {
    const foodCashflow = calculateMonthlyCashflow(
      [
        {
          date: new Date("2026-06-02T00:00:00.000Z"),
          type: "expense",
          amount: amount(250),
          categoryId: "food"
        },
        {
          date: new Date("2026-06-03T00:00:00.000Z"),
          type: "income",
          amount: amount(25),
          categoryId: "settlement",
          expenseOffsetCategoryId: "food"
        },
        {
          date: new Date("2026-06-05T00:00:00.000Z"),
          type: "transfer",
          amount: amount(9999),
          categoryId: null,
          expenseOffsetCategoryId: null
        }
      ],
      { categoryId: "food" }
    );

    expect(foodCashflow).toEqual([
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
  });

  it("filters to multiple categories via categoryIds", () => {
    const multiCategoryCashflow = calculateMonthlyCashflow(
      [
        {
          date: new Date("2026-06-01T00:00:00.000Z"),
          type: "income",
          amount: amount(1000),
          categoryId: "salary"
        },
        {
          date: new Date("2026-06-02T00:00:00.000Z"),
          type: "expense",
          amount: amount(250),
          categoryId: "food"
        },
        {
          date: new Date("2026-06-03T00:00:00.000Z"),
          type: "income",
          amount: amount(25),
          categoryId: "settlement",
          expenseOffsetCategoryId: "food"
        },
        {
          date: new Date("2026-06-04T00:00:00.000Z"),
          type: "expense",
          amount: amount(25),
          categoryId: "settlement"
        }
      ],
      { categoryIds: ["food", "settlement"] }
    );

    expect(multiCategoryCashflow).toEqual([
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
  });

  it("returns an empty array when there are no income/expense transactions", () => {
    expect(
      calculateMonthlyCashflow([
        {
          date: new Date("2026-06-01T00:00:00.000Z"),
          type: "transfer",
          amount: amount(100)
        }
      ])
    ).toEqual([]);
  });
});
