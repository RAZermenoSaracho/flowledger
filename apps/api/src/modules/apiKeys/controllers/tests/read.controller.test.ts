import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/read.service.js", () => ({ listApiKeys: vi.fn() }));

const { listApiKeys } = await import("../../services/read.service.js");
const { getApiKeys } = await import("../read.controller.js");

describe("getApiKeys", () => {
  it("lists the caller's keys", async () => {
    vi.mocked(listApiKeys).mockResolvedValue([{ id: "k1" }] as never);
    const res = mockResponse();

    await getApiKeys(mockRequest(), res);

    expect(listApiKeys).toHaveBeenCalledWith("user-1");
    expect(res.json).toHaveBeenCalledWith({ apiKeys: [{ id: "k1" }] });
  });
});
