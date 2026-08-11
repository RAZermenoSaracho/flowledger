import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/update.service.js", () => ({
  updateSharedExpense: vi.fn()
}));

const { updateSharedExpense } = await import("../../services/update.service.js");
const { putSharedExpense } = await import("../update.controller.js");

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
