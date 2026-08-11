import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

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
  return { _sum: { amount: { toNumber: () => amount } }, executionCurrency, ...extra };
}

describe("getSummaryReport", () => {
  it("uses the user's preferred currency when no explicit filter currency is set", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({
      preferredCurrency: "mxn"
    } as never);
    prismaMock.transaction.groupBy.mockResolvedValue([]);

    const result = await getSummaryReport("user-1", {});

    expect(result.currency).toBe("MXN");
  });

  it("uses the explicit filter currency over the user's preference", async () => {
    prismaMock.transaction.groupBy.mockResolvedValue([]);

    const result = await getSummaryReport("user-1", { currency: "EUR" });

    expect(result.currency).toBe("EUR");
    expect(prismaMock.user.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("sums same-currency rows without calling getExchangeRate", async () => {
    prismaMock.transaction.groupBy
      .mockResolvedValueOnce([groupByRow(1000)] as never) // income
      .mockResolvedValueOnce([groupByRow(1000)] as never) // net income
      .mockResolvedValueOnce([groupByRow(400)] as never) // expense
      .mockResolvedValueOnce([] as never); // reimbursements

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
    prismaMock.transaction.groupBy
      .mockResolvedValueOnce([groupByRow(100, "USD")] as never)
      .mockResolvedValueOnce([groupByRow(100, "USD")] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    const result = await getSummaryReport("user-1", { currency: "MXN" });

    expect(getExchangeRateMock).toHaveBeenCalledWith("USD", "MXN");
    expect(result.summary.totalGrossIncome).toBe(1700);
  });

  it("uses gross amounts for reportIncome/reportExpenses in gross mode", async () => {
    prismaMock.transaction.groupBy
      .mockResolvedValueOnce([groupByRow(1000)] as never) // income
      .mockResolvedValueOnce([groupByRow(800)] as never) // net income (after offset)
      .mockResolvedValueOnce([groupByRow(400)] as never) // expense
      .mockResolvedValueOnce([groupByRow(200)] as never); // reimbursements

    const result = await getSummaryReport("user-1", {
      currency: "USD",
      amountMode: "gross"
    });

    expect(result.summary.reportIncome).toBe(1000);
    expect(result.summary.reportExpenses).toBe(400);
  });

  it("uses net amounts for reportIncome/reportExpenses by default", async () => {
    prismaMock.transaction.groupBy
      .mockResolvedValueOnce([groupByRow(1000)] as never)
      .mockResolvedValueOnce([groupByRow(800)] as never)
      .mockResolvedValueOnce([groupByRow(400)] as never)
      .mockResolvedValueOnce([groupByRow(200)] as never);

    const result = await getSummaryReport("user-1", { currency: "USD" });

    expect(result.summary.reportIncome).toBe(800);
    expect(result.summary.reportExpenses).toBe(200); // 400 gross - 200 reimbursed
  });
});

describe("getByCategoryReport", () => {
  it("maps grouped rows to category chart rows with names from the category lookup", async () => {
    prismaMock.transaction.groupBy
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
    prismaMock.transaction.groupBy
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
    prismaMock.transaction.groupBy
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
    prismaMock.transaction.groupBy
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
        amount: { toNumber: () => 100 },
        executionCurrency: "USD",
        categoryId: "salary",
        expenseOffsetCategoryId: null
      }
    ] as never);
    convertAmountMock.mockResolvedValue(1700);

    const result = await getMonthlyCashflowReport("user-1", { currency: "MXN" });

    expect(convertAmountMock).toHaveBeenCalled();
    expect(result.cashflow[0]).toMatchObject({ income: 1700 });
    expect(result.currency).toBe("MXN");
  });

  it("uses reportIncome/reportExpenses matching the requested amountMode", async () => {
    prismaMock.transaction.findMany.mockResolvedValue([
      {
        date: new Date("2024-01-15"),
        type: "income",
        amount: { toNumber: () => 100 },
        executionCurrency: "USD",
        categoryId: "settlement",
        expenseOffsetCategoryId: "food"
      }
    ] as never);
    convertAmountMock.mockResolvedValue(100);

    const result = await getMonthlyCashflowReport("user-1", {
      currency: "USD",
      amountMode: "gross"
    });

    expect(result.cashflow[0]?.reportIncome).toBe(result.cashflow[0]?.grossIncome);
  });
});
