import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/holdings.read.service.js", () => ({ getAccountHoldings: vi.fn() }));
vi.mock("../../services/holdings.update.service.js", () => ({ applyHoldingChanges: vi.fn(), refreshAccountHoldings: vi.fn() }));

const { getAccountHoldings } = await import("../../services/holdings.read.service.js");
const { applyHoldingChanges, refreshAccountHoldings } = await import("../../services/holdings.update.service.js");
const { getHoldings, patchHoldings, postRefreshHoldings } = await import("../holdings.controller.js");

const result = { accountId: "acc-1", holdings: [{ id: "h1", quantity: "0.1" }], valuation: { value: "5.00" } };

describe("getHoldings", () => {
  it("returns the holdings of the user's account", async () => {
    vi.mocked(getAccountHoldings).mockResolvedValue(result as never);
    const res = mockResponse();

    await getHoldings(mockRequest({ params: { id: "acc-1" } }), res);

    expect(getAccountHoldings).toHaveBeenCalledWith("user-1", "acc-1");
    expect(res.json).toHaveBeenCalledWith(result);
  });
});

describe("patchHoldings", () => {
  it("applies the change set and returns the resulting body", async () => {
    vi.mocked(applyHoldingChanges).mockResolvedValue(result as never);
    const res = mockResponse();
    const body = { upsert: [], remove: ["h2"] };

    await patchHoldings(mockRequest({ params: { id: "acc-1" }, body }), res);

    expect(applyHoldingChanges).toHaveBeenCalledWith("user-1", "acc-1", body);
    expect(res.json).toHaveBeenCalledWith(result);
  });
});

describe("postRefreshHoldings", () => {
  it("refreshes the user's account and returns the holdings body", async () => {
    vi.mocked(refreshAccountHoldings).mockResolvedValue(result as never);
    const res = mockResponse();

    await postRefreshHoldings(mockRequest({ params: { id: "acc-1" } }), res);

    expect(refreshAccountHoldings).toHaveBeenCalledWith("user-1", "acc-1");
    expect(res.json).toHaveBeenCalledWith(result);
  });
});
