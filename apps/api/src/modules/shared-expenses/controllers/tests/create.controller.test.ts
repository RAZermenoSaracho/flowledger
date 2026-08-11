import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/create.service.js", () => ({
  createSharedExpense: vi.fn()
}));

const { createSharedExpense } = await import("../../services/create.service.js");
const { postSharedExpense } = await import("../create.controller.js");

describe("postSharedExpense", () => {
  it("creates the shared expense and responds 201", async () => {
    vi.mocked(createSharedExpense).mockResolvedValue({ id: "se-1" } as never);
    const res = mockResponse();

    await postSharedExpense(
      mockRequest({ body: { transactionId: "txn-1", title: "Dinner" } }),
      res
    );

    expect(createSharedExpense).toHaveBeenCalledWith("user-1", {
      transactionId: "txn-1",
      title: "Dinner"
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
