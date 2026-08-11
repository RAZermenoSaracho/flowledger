import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/read.service.js", () => ({
  getByCategoryReport: vi.fn(),
  getMonthlyCashflowReport: vi.fn(),
  getSummaryReport: vi.fn()
}));

const { getByCategoryReport, getMonthlyCashflowReport, getSummaryReport } =
  await import("../../services/read.service.js");
const { getByCategory, getMonthlyCashflow, getSummary } = await import(
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
