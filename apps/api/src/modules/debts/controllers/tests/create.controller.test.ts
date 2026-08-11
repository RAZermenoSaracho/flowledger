import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/create.service.js", () => ({
  createBatchSettlementRequests: vi.fn(),
  createSettlementRequest: vi.fn()
}));

const { createBatchSettlementRequests, createSettlementRequest } = await import(
  "../../services/create.service.js"
);
const { postBatchSettlementRequests, postSettlementRequest } = await import(
  "../create.controller.js"
);

describe("postSettlementRequest", () => {
  it("creates the settlement request and responds 201", async () => {
    vi.mocked(createSettlementRequest).mockResolvedValue({ id: "sr-1" } as never);
    const res = mockResponse();

    await postSettlementRequest(
      mockRequest({ params: { id: "debt-1" }, body: { amount: 50 } }),
      res
    );

    expect(createSettlementRequest).toHaveBeenCalledWith("user-1", "debt-1", {
      amount: 50
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe("postBatchSettlementRequests", () => {
  it("creates settlement requests for every entry", async () => {
    vi.mocked(createBatchSettlementRequests).mockResolvedValue([
      { id: "sr-1" }
    ] as never);
    const res = mockResponse();

    await postBatchSettlementRequests(
      mockRequest({ body: { requests: [{ debtId: "debt-1", amount: 50 }] } }),
      res
    );

    expect(createBatchSettlementRequests).toHaveBeenCalledWith("user-1", [
      { debtId: "debt-1", amount: 50 }
    ]);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
