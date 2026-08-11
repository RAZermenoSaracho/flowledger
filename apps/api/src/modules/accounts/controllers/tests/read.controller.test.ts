import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/read.service.js", () => ({
  listAccounts: vi.fn()
}));

const { listAccounts } = await import("../../services/read.service.js");
const { getAccounts } = await import("../read.controller.js");

describe("getAccounts", () => {
  it("lists the authenticated user's accounts", async () => {
    vi.mocked(listAccounts).mockResolvedValue([{ id: "acc-1" }] as never);
    const res = mockResponse();

    await getAccounts(mockRequest({ query: { query: "{}" } }), res);

    expect(listAccounts).toHaveBeenCalledWith("user-1", "{}");
    expect(res.json).toHaveBeenCalledWith({ accounts: [{ id: "acc-1" }] });
  });
});
