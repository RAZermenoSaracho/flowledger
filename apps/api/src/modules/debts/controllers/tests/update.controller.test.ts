import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/update.service.js", () => ({
  approveBatchSettlements: vi.fn(),
  approveSettlement: vi.fn(),
  rejectSettlement: vi.fn(),
  settleDebtDirectly: vi.fn()
}));

const {
  approveBatchSettlements,
  approveSettlement,
  rejectSettlement,
  settleDebtDirectly
} = await import("../../services/update.service.js");
const {
  postApproveSettlement,
  postBatchApproveSettlements,
  postRejectSettlement,
  postSettle
} = await import("../update.controller.js");

describe("postSettle", () => {
  it("settles the debt directly", async () => {
    vi.mocked(settleDebtDirectly).mockResolvedValue({ debt: {} } as never);
    const res = mockResponse();

    await postSettle(mockRequest({ params: { id: "debt-1" } }), res);

    expect(settleDebtDirectly).toHaveBeenCalledWith("user-1", "debt-1");
  });
});

describe("postApproveSettlement", () => {
  it("approves the settlement request", async () => {
    vi.mocked(approveSettlement).mockResolvedValue({ debt: {} } as never);
    const res = mockResponse();

    await postApproveSettlement(
      mockRequest({ params: { id: "sr-1" }, body: { accountId: "a", categoryId: "c" } }),
      res
    );

    expect(approveSettlement).toHaveBeenCalledWith("user-1", "sr-1", {
      accountId: "a",
      categoryId: "c"
    });
  });
});

describe("postBatchApproveSettlements", () => {
  it("approves multiple settlement requests", async () => {
    vi.mocked(approveBatchSettlements).mockResolvedValue([{ debt: {} }] as never);
    const res = mockResponse();

    await postBatchApproveSettlements(
      mockRequest({ body: { approvals: [{ settlementRequestId: "sr-1" }] } }),
      res
    );

    expect(approveBatchSettlements).toHaveBeenCalledWith("user-1", [
      { settlementRequestId: "sr-1" }
    ]);
  });
});

describe("postRejectSettlement", () => {
  it("rejects the settlement request", async () => {
    vi.mocked(rejectSettlement).mockResolvedValue({ id: "sr-1" } as never);
    const res = mockResponse();

    await postRejectSettlement(mockRequest({ params: { id: "sr-1" } }), res);

    expect(rejectSettlement).toHaveBeenCalledWith("user-1", "sr-1");
  });
});
