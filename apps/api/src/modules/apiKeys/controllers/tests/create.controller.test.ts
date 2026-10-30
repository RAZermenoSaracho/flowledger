import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/create.service.js", () => ({ createApiKey: vi.fn() }));

const { createApiKey } = await import("../../services/create.service.js");
const { postApiKey } = await import("../create.controller.js");

describe("postApiKey", () => {
  it("responds 201 with the record and plaintext key", async () => {
    vi.mocked(createApiKey).mockResolvedValue({ apiKey: { id: "k1" }, key: "fl_abc" } as never);
    const body = { name: "CI", allowWrite: false, lifetime: "1m" };
    const res = mockResponse();

    await postApiKey(mockRequest({ body } as never), res);

    expect(createApiKey).toHaveBeenCalledWith("user-1", body);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ apiKey: { id: "k1" }, key: "fl_abc" });
  });
});
