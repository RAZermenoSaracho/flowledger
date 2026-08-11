import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/delete.service.js", () => ({
  deleteTransaction: vi.fn()
}));

const { deleteTransaction } = await import("../../services/delete.service.js");
const { deleteTransactionHandler } = await import("../delete.controller.js");

describe("deleteTransactionHandler", () => {
  it("deletes the transaction and responds 204", async () => {
    vi.mocked(deleteTransaction).mockResolvedValue(undefined);
    const res = mockResponse();

    await deleteTransactionHandler(mockRequest({ params: { id: "txn-1" } }), res);

    expect(deleteTransaction).toHaveBeenCalledWith("user-1", "txn-1");
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
