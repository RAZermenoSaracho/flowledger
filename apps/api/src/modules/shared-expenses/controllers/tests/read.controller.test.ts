import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/read.service.js", () => ({
  getSharedExpenseById: vi.fn(),
  listSharedExpenses: vi.fn()
}));

const { getSharedExpenseById, listSharedExpenses } = await import(
  "../../services/read.service.js"
);
const { getSharedExpense, getSharedExpenses } = await import("../read.controller.js");

describe("getSharedExpenses", () => {
  it("lists the caller's shared expenses", async () => {
    vi.mocked(listSharedExpenses).mockResolvedValue([{ id: "se-1" }] as never);
    const res = mockResponse();

    await getSharedExpenses(mockRequest({ query: { query: "{}" } }), res);

    expect(listSharedExpenses).toHaveBeenCalledWith("user-1", "{}");
  });
});

describe("getSharedExpense", () => {
  it("fetches one shared expense by id", async () => {
    vi.mocked(getSharedExpenseById).mockResolvedValue({ id: "se-1" } as never);
    const res = mockResponse();

    await getSharedExpense(mockRequest({ params: { id: "se-1" } }), res);

    expect(getSharedExpenseById).toHaveBeenCalledWith("user-1", "se-1");
  });
});
