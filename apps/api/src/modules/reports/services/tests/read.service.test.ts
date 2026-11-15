import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

/**
 * `transaction.groupBy` is Prisma's most heavily overloaded generic method —
 * `vitest-mock-extended`'s typing can't express `.mockResolvedValue(...)` on
 * it directly, so this narrows it to a plain mock-like shape for test use.
 */
interface GroupByMock {
  mockResolvedValue: (value: unknown) => GroupByMock;
  mockResolvedValueOnce: (value: unknown) => GroupByMock;
}
const groupByMock = prismaMock.transaction.groupBy as unknown as GroupByMock;

vi.mock("../../../currencies/services/read.service.js", () => ({
  getExchangeRate: vi.fn()
}));

vi.mock("../../utils/reportCurrency.js", () => ({
  convertAmount: vi.fn()
}));

const { getExchangeRate } = await import("../../../currencies/services/read.service.js");
const { convertAmount } = await import("../../utils/reportCurrency.js");
const getExchangeRateMock = vi.mocked(getExchangeRate);
const convertAmountMock = vi.mocked(convertAmount);

const { getByCategoryReport, getMonthlyCashflowReport, getSummaryReport } =
  await import("../read.service.js");

function groupByRow(
  amount: number,
  executionCurrency = "USD",
  extra: Record<string, unknown> = {}
) {
  return { _sum: { amount: new Prisma.Decimal(amount) }, executionCurrency, ...extra };
}

describe("getSummaryReport", () => {
  it("uses the user's preferred currency when no explicit filter currency is set", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      preferredCurrency: "mxn"
    } as never);
    groupByMock.mockResolvedValue([]);

    const result = await getSummaryReport("user-1", {});

    expect(result.currency).toBe("MXN");
  });

  it("uses the explicit filter currency over the user's preference", async () => {
    groupByMock.mockResolvedValue([]);

    const result = await getSummaryReport("user-1", { currency: "EUR" });

    expect(result.currency).toBe("EUR");
    expect(prismaMock.user.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("sums same-currency rows without calling getExchangeRate", async () => {
    groupByMock
      .mockResolvedValueOnce([groupByRow(1000)] as never) // income
      .mockResolvedValueOnce([groupByRow(1000)] as never) // net income
      .mockResolvedValueOnce([groupByRow(400)] as never) // expense
      .mockResolvedValueOnce([] as never) // reimbursements
      .mockResolvedValueOnce([] as never) // card transfers
      .mockResolvedValueOnce([] as never); // card income

    const result = await getSummaryReport("user-1", { currency: "USD" });

    expect(getExchangeRateMock).not.toHaveBeenCalled();
    expect(result.summary).toMatchObject({
      totalGrossIncome: 1000,
      totalGrossExpenses: 400,
      currentBalance: 600
    });
  });

  it("converts a different-currency row using the live exchange rate", async () => {
    getExchangeRateMock.mockResolvedValue(17);
    groupByMock
      .mockResolvedValueOnce([groupByRow(100, "USD")] as never)
      .mockResolvedValueOnce([groupByRow(100, "USD")] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const result = await getSummaryReport("user-1", { currency: "MXN" });

    expect(getExchangeRateMock).toHaveBeenCalledWith("USD", "MXN");
    expect(result.summary.totalGrossIncome).toBe(1700);
  });

  it("uses gross amounts for reportIncome/reportExpenses in gross mode", async () => {
    groupByMock
      .mockResolvedValueOnce([groupByRow(1000)] as never) // income
      .mockResolvedValueOnce([groupByRow(800)] as never) // net income (after offset)
      .mockResolvedValueOnce([groupByRow(400)] as never) // expense
      .mockResolvedValueOnce([groupByRow(200)] as never) // reimbursements
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const result = await getSummaryReport("user-1", {
      currency: "USD",
      amountMode: "gross"
    });

    expect(result.summary.reportIncome).toBe(1000);
    expect(result.summary.reportExpenses).toBe(400);
  });

  it("uses net amounts for reportIncome/reportExpenses by default", async () => {
    groupByMock
      .mockResolvedValueOnce([groupByRow(1000)] as never)
      .mockResolvedValueOnce([groupByRow(800)] as never)
      .mockResolvedValueOnce([groupByRow(400)] as never)
      .mockResolvedValueOnce([groupByRow(200)] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const result = await getSummaryReport("user-1", { currency: "USD" });

    expect(result.summary.reportIncome).toBe(800);
    expect(result.summary.reportExpenses).toBe(200); // 400 gross - 200 reimbursed
  });
});

describe("getByCategoryReport", () => {
  it("maps grouped rows to category chart rows with names from the category lookup", async () => {
    groupByMock
      .mockResolvedValueOnce([
        groupByRow(300, "USD", { categoryId: "food", type: "expense" })
      ] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    prismaMock.category.findMany.mockResolvedValue([
      { id: "food", name: "Food", type: "expense", color: "#123456" }
    ] as never);

    const result = await getByCategoryReport("user-1", { currency: "USD" });

    expect(result.expenseCategories).toHaveLength(1);
    expect(result.expenseCategories[0]).toMatchObject({
      categoryId: "food",
      categoryName: "Food",
      grossExpenseTotal: 300
    });
  });

  it("labels an uncategorized row as 'Uncategorized'", async () => {
    groupByMock
      .mockResolvedValueOnce([
        groupByRow(50, "USD", { categoryId: null, type: "expense" })
      ] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);
    prismaMock.category.findMany.mockResolvedValue([]);

    const result = await getByCategoryReport("user-1", { currency: "USD" });

    expect(result.expenseCategories[0]?.categoryName).toBe("Uncategorized");
  });

  it("nets expense reimbursements against their original category's total", async () => {
    groupByMock
      .mockResolvedValueOnce([
        groupByRow(300, "USD", { categoryId: "food", type: "expense" })
      ] as never)
      .mockResolvedValueOnce([
        groupByRow(100, "USD", { expenseOffsetCategoryId: "food" })
      ] as never)
      .mockResolvedValueOnce([] as never);
    prismaMock.category.findMany.mockResolvedValue([
      { id: "food", name: "Food", type: "expense", color: null }
    ] as never);

    const result = await getByCategoryReport("user-1", { currency: "USD" });

    expect(result.expenseCategories[0]).toMatchObject({
      grossExpenseTotal: 300,
      reimbursementTotal: 100,
      netExpenseTotal: 200
    });
  });

  it("includes a reimbursement-only category (fully offset, not in the main rows)", async () => {
    groupByMock
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        groupByRow(50, "USD", { expenseOffsetCategoryId: "settlement" })
      ] as never)
      .mockResolvedValueOnce([] as never);
    prismaMock.category.findMany.mockResolvedValue([
      { id: "settlement", name: "Settlement", type: "expense", color: null }
    ] as never);

    const result = await getByCategoryReport("user-1", { currency: "USD" });

    expect(result.expenseCategories.map((c) => c.categoryId)).toContain(
      "settlement"
    );
  });
});

describe("getMonthlyCashflowReport", () => {
  it("converts each transaction to the target currency before building the cashflow", async () => {
    prismaMock.transaction.findMany.mockResolvedValue([
      {
        date: new Date("2024-01-15"),
        type: "income",
        amount: new Prisma.Decimal(100),
        executionCurrency: "USD",
        categoryId: "salary",
        expenseOffsetCategoryId: null
      }
    ] as never);
    convertAmountMock.mockResolvedValue(new Prisma.Decimal(1700));

    const result = await getMonthlyCashflowReport("user-1", { currency: "MXN" });

    expect(convertAmountMock).toHaveBeenCalled();
    expect(result.cashflow[0]).toMatchObject({ income: 1700 });
    expect(result.currency).toBe("MXN");
  });

  it("buckets months in the requested timeZone", async () => {
    prismaMock.transaction.findMany.mockResolvedValue([
      {
        date: new Date("2026-06-01T03:00:00.000Z"),
        type: "income",
        amount: new Prisma.Decimal(100),
        executionCurrency: "USD",
        categoryId: "salary",
        expenseOffsetCategoryId: null
      }
    ] as never);
    convertAmountMock.mockResolvedValue(new Prisma.Decimal(100));

    const local = await getMonthlyCashflowReport("user-1", {
      currency: "USD",
      timeZone: "America/Mexico_City"
    });
    const utc = await getMonthlyCashflowReport("user-1", { currency: "USD" });

    expect(local.cashflow.map((row) => row.month)).toEqual(["2026-05"]);
    expect(utc.cashflow.map((row) => row.month)).toEqual(["2026-06"]);
  });

  it("uses reportIncome/reportExpenses matching the requested amountMode", async () => {
    prismaMock.transaction.findMany.mockResolvedValue([
      {
        date: new Date("2024-01-15"),
        type: "income",
        amount: new Prisma.Decimal(100),
        executionCurrency: "USD",
        categoryId: "settlement",
        expenseOffsetCategoryId: "food"
      }
    ] as never);
    convertAmountMock.mockResolvedValue(new Prisma.Decimal(100));

    const result = await getMonthlyCashflowReport("user-1", {
      currency: "USD",
      amountMode: "gross"
    });

    expect(result.cashflow[0]?.reportIncome).toBe(result.cashflow[0]?.grossIncome);
  });
});

interface SeedWhere {
  type?: string;
  AND?: unknown;
  transferToAccount?: unknown;
  account?: { type?: string };
  expenseOffsetCategoryId?: { not?: null } | string | null;
}

describe("credit-card reporting", () => {
  type Row = {
    type: "income" | "expense" | "transfer";
    amount: number;
    account?: "card" | "bank" | null;
    toCard?: boolean;
    offset?: boolean;
    kind?: string | null;
    category?: string;
  };

  /** Fake DB: answers summary groupBy calls by interpreting the where clause the service built. */
  function seed(rows: Row[]) {
    (prismaMock.transaction.groupBy as unknown as {
      mockImplementation: (fn: (args: { where: SeedWhere; by: string[] }) => unknown) => void;
    }).mockImplementation((args) => {
      const w = args.where;
      const sumOf = (rs: Row[], by: string[]) => {
        const buckets = new Map<string, { key: Record<string, unknown>; sum: number }>();
        for (const r of rs) {
          const key = Object.fromEntries(
            by.map((f) => [f, f === "creditCardKind" ? (r.kind ?? null) : f === "categoryId" ? (r.category ?? null) : f === "type" ? r.type : "USD"])
          );
          const id = JSON.stringify(key);
          const b = buckets.get(id) ?? { key, sum: 0 };
          b.sum += r.amount;
          buckets.set(id, b);
        }
        return [...buckets.values()].map((b) => ({ ...b.key, _sum: { amount: new Prisma.Decimal(b.sum) } }));
      };
      const isCard = (r: Row) => r.account === "card";
      let hit = rows;
      if (w.transferToAccount) hit = rows.filter((r) => r.type === "transfer" && r.toCard);
      else if (w.account?.type === "credit_card") hit = rows.filter((r) => r.type === "income" && isCard(r));
      else if (w.expenseOffsetCategoryId) hit = rows.filter((r) => r.type === "income" && r.offset);
      else if (w.type === "income") {
        hit = rows.filter((r) => r.type === "income" && !isCard(r));
        if (w.expenseOffsetCategoryId === null) hit = hit.filter((r) => !r.offset);
      } else if (w.type === "expense") hit = rows.filter((r) => r.type === "expense");
      return Promise.resolve(sumOf(hit, args.by));
    });
  }

  const zeroCredits = { total: "0", transfers: "0", payments: "0", refunds: "0", cashback: "0", other: "0" };

  it("counts a card purchase as expense and a transfer to the card as a credit, not income", async () => {
    seed([
      { type: "income", amount: 8000, account: "bank" },
      { type: "expense", amount: 2000, account: "card" },
      { type: "transfer", amount: 3000, account: "bank", toCard: true }
    ]);
    const { summary } = await getSummaryReport("user-1", { currency: "USD" });
    expect(summary.totalGrossIncome).toBe(8000);
    expect(summary.totalGrossExpenses).toBe(2000);
    expect(summary.creditCardCredits).toEqual({ ...zeroCredits, total: "3000", transfers: "3000" });
  });

  it("treats an external payment (income on the card) as a credit, not income", async () => {
    seed([
      { type: "expense", amount: 2000, account: "card" },
      { type: "income", amount: 3000, account: "card", kind: "payment" }
    ]);
    const { summary } = await getSummaryReport("user-1", { currency: "USD" });
    expect(summary.totalGrossIncome).toBe(0);
    expect(summary.creditCardCredits).toEqual({ ...zeroCredits, total: "3000", payments: "3000" });
  });

  it("reduces net expenses for a refund with an offset category, in both amount modes", async () => {
    seed([
      { type: "expense", amount: 1000, account: "card", category: "groceries" },
      { type: "income", amount: 400, account: "card", kind: "refund", offset: true, category: "groceries" }
    ]);
    const net = await getSummaryReport("user-1", { currency: "USD" });
    const gross = await getSummaryReport("user-1", { currency: "USD", amountMode: "gross" });
    expect(net.summary).toMatchObject({ totalGrossExpenses: 1000, totalNetExpenses: 600, totalGrossIncome: 0, reportExpenses: 600 });
    expect(gross.summary).toMatchObject({ totalGrossExpenses: 1000, reportExpenses: 1000 });
    expect(net.summary.creditCardCredits).toEqual(gross.summary.creditCardCredits);
    expect(net.summary.creditCardCredits).toEqual({ ...zeroCredits, total: "400", refunds: "400" });
  });

  it("reports cashback as a credit, never income", async () => {
    seed([{ type: "income", amount: 50, account: "card", kind: "cashback" }]);
    const { summary } = await getSummaryReport("user-1", { currency: "USD" });
    expect(summary.totalGrossIncome).toBe(0);
    expect(summary.creditCardCredits).toEqual({ ...zeroCredits, total: "50", cashback: "50" });
  });

  it("never duplicates the card expense when a transfer pays it", async () => {
    seed([
      { type: "expense", amount: 2000, account: "card" },
      { type: "transfer", amount: 2000, account: "bank", toCard: true }
    ]);
    const { summary } = await getSummaryReport("user-1", { currency: "USD" });
    expect(summary.totalGrossExpenses).toBe(2000);
  });

  it("gives a user without cards the same totals and all-zero credits", async () => {
    seed([
      { type: "income", amount: 1000, account: "bank" },
      { type: "expense", amount: 400, account: "bank" }
    ]);
    const { summary } = await getSummaryReport("user-1", { currency: "USD" });
    expect(summary).toMatchObject({ totalGrossIncome: 1000, totalGrossExpenses: 400, currentBalance: 600 });
    expect(summary.creditCardCredits).toEqual(zeroCredits);
  });

  it("excludes card income from income queries but not from the offset query", async () => {
    seed([]);
    await getSummaryReport("user-1", { currency: "USD" });
    const calls = (prismaMock.transaction.groupBy as unknown as { mock: { calls: { where: SeedWhere }[][] } }).mock.calls;
    const wheres = calls.map((c) => c[0]!.where);
    const incomeWheres = wheres.filter((w) => w.type === "income" && w.AND);
    expect(incomeWheres.length).toBe(2);
    const offset = wheres.find(
      (w) => w.type === "income" && typeof w.expenseOffsetCategoryId === "object" && w.expenseOffsetCategoryId?.not === null
    );
    expect(offset!.AND).toBeUndefined();
  });
});

describe("cashflow with card income", () => {
  it("skips card income for income totals but keeps its expense reimbursement", async () => {
    prismaMock.transaction.findMany.mockResolvedValue([
      { date: new Date("2026-03-05"), type: "income", amount: new Prisma.Decimal(400), executionCurrency: "USD", categoryId: null, expenseOffsetCategoryId: "groceries", account: { type: "credit_card" } },
      { date: new Date("2026-03-06"), type: "income", amount: new Prisma.Decimal(500), executionCurrency: "USD", categoryId: null, expenseOffsetCategoryId: null, account: { type: "credit_card" } },
      { date: new Date("2026-03-07"), type: "expense", amount: new Prisma.Decimal(1000), executionCurrency: "USD", categoryId: "groceries", expenseOffsetCategoryId: null, account: { type: "credit_card" } }
    ] as never);
    convertAmountMock.mockImplementation(async (a) => a as never);
    const { cashflow } = await getMonthlyCashflowReport("user-1", { currency: "USD" });
    expect(cashflow[0]).toMatchObject({ grossIncome: 0, netIncome: 0, grossExpenses: 1000, expenseReimbursements: 400, netExpenses: 600 });
  });
});
