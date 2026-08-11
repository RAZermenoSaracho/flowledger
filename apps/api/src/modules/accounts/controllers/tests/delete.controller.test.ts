import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/delete.service.js", () => ({
  deleteAccount: vi.fn()
}));

const { deleteAccount } = await import("../../services/delete.service.js");
const { deleteAccountHandler } = await import("../delete.controller.js");

describe("deleteAccountHandler", () => {
  it("deletes the account and responds 204", async () => {
    vi.mocked(deleteAccount).mockResolvedValue(undefined);
    const res = mockResponse();

    await deleteAccountHandler(mockRequest({ params: { id: "acc-1" } }), res);

    expect(deleteAccount).toHaveBeenCalledWith("user-1", "acc-1");
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
