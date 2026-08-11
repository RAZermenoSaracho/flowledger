import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/delete.service.js", () => ({
  deleteSharedExpense: vi.fn()
}));

const { deleteSharedExpense } = await import("../../services/delete.service.js");
const { deleteSharedExpenseController } = await import("../delete.controller.js");

describe("deleteSharedExpenseController", () => {
  it("deletes the shared expense and responds 204", async () => {
    vi.mocked(deleteSharedExpense).mockResolvedValue(undefined);
    const res = mockResponse();

    await deleteSharedExpenseController(mockRequest({ params: { id: "se-1" } }), res);

    expect(deleteSharedExpense).toHaveBeenCalledWith("user-1", "se-1");
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
