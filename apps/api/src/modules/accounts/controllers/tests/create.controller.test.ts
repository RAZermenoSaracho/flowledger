import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/create.service.js", () => ({
  createAccount: vi.fn()
}));

const { createAccount } = await import("../../services/create.service.js");
const { postAccount } = await import("../create.controller.js");

describe("postAccount", () => {
  it("creates the account and responds 201", async () => {
    vi.mocked(createAccount).mockResolvedValue({ id: "acc-1" } as never);
    const res = mockResponse();

    await postAccount(mockRequest({ body: { name: "Checking" } }), res);

    expect(createAccount).toHaveBeenCalledWith("user-1", { name: "Checking" });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ account: { id: "acc-1" } });
  });
});
