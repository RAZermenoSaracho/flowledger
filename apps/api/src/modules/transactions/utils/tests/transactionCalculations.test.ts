import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  calculateAccountBalance,
  calculateMonthlyCashflow,
  withAccountBalances
} from "../transactionCalculations.js";

const amount = (value: number | string) => new Prisma.Decimal(value);

describe("calculateAccountBalance", () => {
  const accountTransactions = [
    {
      accountId: "checking",
      transferToAccountId: null,
      type: "income" as const,
      accountAmount: amount(1000)
    },
    {
      accountId: "checking",
      transferToAccountId: null,
      type: "expense" as const,
      accountAmount: amount(150)
    },
    {
      accountId: "checking",
      transferToAccountId: "savings",
      type: "transfer" as const,
      accountAmount: amount(200),
      destinationAmount: amount(200)
    },
    {
      accountId: "cash",
      transferToAccountId: "checking",
      type: "transfer" as const,
      accountAmount: amount(50),
      destinationAmount: amount(50)
    }
  ];

  it("adds income and subtracts expense/outgoing transfers for the matching account", () => {
    expect(calculateAccountBalance("checking", accountTransactions).toFixed()).toBe("700");
  });

  it("adds an optional initialBalance", () => {
    expect(
      calculateAccountBalance("checking", accountTransactions, amount(25)).toFixed()
    ).toBe("725");
  });

  it("credits the destination account for an incoming transfer", () => {
    expect(calculateAccountBalance("savings", accountTransactions).toFixed()).toBe("200");
  });

  it("debits the source account for an outgoing transfer", () => {
    expect(calculateAccountBalance("cash", accountTransactions).toFixed()).toBe("-50");
  });

  it("returns the initial balance alone for an account with no transactions", () => {
    expect(
      calculateAccountBalance("unused", accountTransactions, amount(10)).toFixed()
    ).toBe("10");
  });

  it("accepts a decimal string amount", () => {
    expect(
      calculateAccountBalance("checking", [
        { accountId: "checking", type: "income", accountAmount: "50.25" }
      ]).toFixed()
    ).toBe("50.25");
  });

  it("applies a USD to MXN transfer as 100 out of the source and 1712.50 into the destination", () => {
    const transfer = [
      {
        accountId: "usd",
        transferToAccountId: "mxn",
        type: "transfer" as const,
        accountAmount: amount(100),
        destinationAmount: amount("1712.50")
      }
    ];

    expect(calculateAccountBalance("usd", transfer, 500).toFixed()).toBe("400");
    expect(calculateAccountBalance("mxn", transfer, 0).toFixed()).toBe("1712.5");
  });

  it("applies a USD expense on an MXN account by its accountAmount", () => {
    expect(
      calculateAccountBalance(
        "mxn",
        [{ accountId: "mxn", type: "expense", accountAmount: amount("342.10") }],
        1000
      ).toFixed()
    ).toBe("657.9");
  });

  it("sums 18-decimal crypto amounts exactly", () => {
    const sats = "0.000000000000000001";
    const rows = Array.from({ length: 3 }, () => ({
      accountId: "btc",
      type: "income" as const,
      accountAmount: sats
    }));

    expect(
      calculateAccountBalance("btc", rows, "1.234567890123456789").toFixed()
    ).toBe("1.234567890123456792");
  });

  it("does not subtract a transfer fee again: only the applied amounts move balances", () => {
    const transfer = [
      {
        accountId: "usd",
        transferToAccountId: "mxn",
        type: "transfer" as const,
        accountAmount: amount(100),
        destinationAmount: amount(1666),
        feeAmount: amount(2),
        feeCurrency: "USD"
      }
    ];

    expect(calculateAccountBalance("usd", transfer, 100).toFixed()).toBe("0");
    expect(calculateAccountBalance("mxn", transfer).toFixed()).toBe("1666");
  });
});

describe("withAccountBalances", () => {
  it("attaches a Decimal currentBalance to each account", () => {
    const accounts = [
      { id: "checking", initialBalance: amount(100) },
      { id: "savings" }
    ];
    const transactions = [
      { accountId: "checking", type: "income" as const, accountAmount: amount(50) }
    ];

    const result = withAccountBalances(accounts, transactions);

    expect(result.map((account) => account.currentBalance.toFixed())).toEqual(["150", "0"]);
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

describe("calculateMonthlyCashflow Decimal sums", () => {
  it("sums 18-decimal amounts exactly before returning numbers", () => {
    const [row] = calculateMonthlyCashflow([
      { date: new Date("2026-06-01T00:00:00.000Z"), type: "income", amount: "0.100000000000000001" },
      { date: new Date("2026-06-02T00:00:00.000Z"), type: "income", amount: "0.200000000000000002" },
      { date: new Date("2026-06-03T00:00:00.000Z"), type: "expense", amount: "0.1" }
    ]);

    expect(row?.income).toBe(0.3);
    expect(row?.balance).toBeCloseTo(0.2, 15);
  });

  it("does not accumulate float error across many small amounts", () => {
    const rows = Array.from({ length: 10 }, (_, day) => ({
      date: new Date(Date.UTC(2026, 5, day + 1)),
      type: "income" as const,
      amount: "0.1"
    }));

    expect(calculateMonthlyCashflow(rows)[0]?.income).toBe(1);
  });
});

describe("calculateMonthlyCashflow month bucketing by timeZone", () => {
  const monthsFor = (iso: string, timeZone?: string) =>
    calculateMonthlyCashflow(
      [{ date: new Date(iso), type: "income", amount: amount(10), categoryId: null }],
      {},
      timeZone
    ).map((row) => row.month);

  it("buckets a negative-offset local month before the UTC month", () => {
    expect(monthsFor("2026-06-01T03:00:00.000Z", "America/Mexico_City")).toEqual(["2026-05"]);
  });

  it("buckets a positive-offset local month after the UTC month", () => {
    expect(monthsFor("2026-05-31T15:00:00.000Z", "Australia/Sydney")).toEqual(["2026-06"]);
  });

  it("defaults to UTC when no timeZone is given", () => {
    expect(monthsFor("2026-06-01T03:00:00.000Z")).toEqual(["2026-06"]);
  });

  it("splits at the exact instant of a month start across a DST change", () => {
    expect(monthsFor("2026-04-01T06:59:59.999Z", "America/Los_Angeles")).toEqual(["2026-03"]);
    expect(monthsFor("2026-04-01T07:00:00.000Z", "America/Los_Angeles")).toEqual(["2026-04"]);
  });
});
