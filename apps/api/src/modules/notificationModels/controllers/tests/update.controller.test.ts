import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/update.service.js", () => ({ updateModel: vi.fn() }));

const { updateModel } = await import("../../services/update.service.js");
const { putModel } = await import("../update.controller.js");

describe("putModel", () => {
  it("updates the caller's model", async () => {
    vi.mocked(updateModel).mockResolvedValue({ id: "m1" } as never);
    const res = mockResponse();
    await putModel(mockRequest({ params: { id: "m1" }, body: { name: "n" } }), res);
    expect(updateModel).toHaveBeenCalledWith("user-1", "m1", { name: "n" });
    expect(res.json).toHaveBeenCalledWith({ model: { id: "m1" } });
  });
});
