import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/read.service.js", () => ({
  getByCategoryReport: vi.fn(),
  getMonthlyCashflowReport: vi.fn(),
  getSummaryReport: vi.fn()
}));

vi.mock("../../services/financialOverview.service.js", () => ({
  getFinancialOverview: vi.fn()
}));

const { getFinancialOverview } = await import("../../services/financialOverview.service.js");
const { getByCategoryReport, getMonthlyCashflowReport, getSummaryReport } =
  await import("../../services/read.service.js");
const { getByCategory, getFinancialOverviewHandler, getMonthlyCashflow, getSummary } = await import(
  "../read.controller.js"
);

describe("getSummary", () => {
  it("returns the summary report for the given filters", async () => {
    vi.mocked(getSummaryReport).mockResolvedValue({ summary: {}, currency: "USD" } as never);
    const res = mockResponse();

    await getSummary(mockRequest({ query: { currency: "USD" } }), res);

    expect(getSummaryReport).toHaveBeenCalledWith("user-1", { currency: "USD" });
  });
});

describe("getByCategory", () => {
  it("returns the category breakdown report", async () => {
    vi.mocked(getByCategoryReport).mockResolvedValue({
      expenseCategories: [],
      incomeCategories: [],
      currency: "USD"
    } as never);
    const res = mockResponse();

    await getByCategory(mockRequest({ query: {} }), res);

    expect(getByCategoryReport).toHaveBeenCalledWith("user-1", {});
  });
});

describe("getMonthlyCashflow", () => {
  it("returns the cashflow rows and currency", async () => {
    vi.mocked(getMonthlyCashflowReport).mockResolvedValue({
      cashflow: [{ month: "2024-01" }],
      currency: "USD"
    } as never);
    const res = mockResponse();

    await getMonthlyCashflow(mockRequest({ query: {} }), res);

    expect(res.json).toHaveBeenCalledWith({
      cashflow: [{ month: "2024-01" }],
      currency: "USD"
    });
  });
});

describe("getFinancialOverviewHandler", () => {
  it("returns the overview for the signed-in user and requested time zone", async () => {
    const overview = { currency: "USD" };
    vi.mocked(getFinancialOverview).mockResolvedValue(overview as never);
    const res = mockResponse();

    await getFinancialOverviewHandler(
      mockRequest({ query: { timeZone: "America/Mexico_City" } }),
      res
    );

    expect(getFinancialOverview).toHaveBeenCalledWith("user-1", "America/Mexico_City");
    expect(res.json).toHaveBeenCalledWith(overview);
  });
});
