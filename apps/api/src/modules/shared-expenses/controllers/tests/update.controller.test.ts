import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/update.service.js", () => ({
  updateSharedExpense: vi.fn(),
  respondToSharedExpense: vi.fn()
}));

const { updateSharedExpense, respondToSharedExpense } = await import("../../services/update.service.js");
const { putSharedExpense, postAcceptSharedExpense, postRejectSharedExpense } = await import("../update.controller.js");

describe("putSharedExpense", () => {
  it("updates the shared expense", async () => {
    vi.mocked(updateSharedExpense).mockResolvedValue({ id: "se-1" } as never);
    const res = mockResponse();

    await putSharedExpense(
      mockRequest({ params: { id: "se-1" }, body: { title: "Renamed" } }),
      res
    );

    expect(updateSharedExpense).toHaveBeenCalledWith("user-1", "se-1", {
      title: "Renamed"
    });
  });
});

describe("accept and reject controllers", () => {
  it("passes the caller and decision to respondToSharedExpense", async () => {
    vi.mocked(respondToSharedExpense).mockResolvedValue({ id: "se-1" } as never);

    await postAcceptSharedExpense(mockRequest({ params: { id: "se-1" } }), mockResponse());
    await postRejectSharedExpense(mockRequest({ params: { id: "se-1" } }), mockResponse());

    expect(respondToSharedExpense).toHaveBeenNthCalledWith(1, "user-1", "se-1", "accepted");
    expect(respondToSharedExpense).toHaveBeenNthCalledWith(2, "user-1", "se-1", "rejected");
  });
});
