import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/create.service.js", () => ({ createModel: vi.fn() }));

const { createModel } = await import("../../services/create.service.js");
const { postModel } = await import("../create.controller.js");

describe("postModel", () => {
  it("creates for the caller and responds 201", async () => {
    vi.mocked(createModel).mockResolvedValue({ id: "m1" } as never);
    const res = mockResponse();
    await postModel(mockRequest({ body: { name: "n" } }), res);
    expect(createModel).toHaveBeenCalledWith("user-1", { name: "n" });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ model: { id: "m1" } });
  });
});
