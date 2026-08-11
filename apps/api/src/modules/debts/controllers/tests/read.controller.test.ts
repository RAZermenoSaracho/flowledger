import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/read.service.js", () => ({
  listDebts: vi.fn()
}));

const { listDebts } = await import("../../services/read.service.js");
const { getDebts } = await import("../read.controller.js");

describe("getDebts", () => {
  it("returns the caller's debts", async () => {
    vi.mocked(listDebts).mockResolvedValue({ iOwe: [], owedToMe: [] } as never);
    const res = mockResponse();

    await getDebts(mockRequest(), res);

    expect(listDebts).toHaveBeenCalledWith("user-1");
    expect(res.json).toHaveBeenCalledWith({ iOwe: [], owedToMe: [] });
  });
});
