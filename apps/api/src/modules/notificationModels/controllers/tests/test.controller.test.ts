import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/test.service.js", () => ({ testModel: vi.fn(), validateCode: vi.fn() }));

const { testModel, validateCode } = await import("../../services/test.service.js");
const { postTest, postValidate } = await import("../test.controller.js");

describe("test controllers", () => {
  it("postValidate responds with the errors", async () => {
    vi.mocked(validateCode).mockResolvedValue({ errors: [] });
    const res = mockResponse();
    await postValidate(mockRequest({ body: { code: "x" } }), res);
    expect(validateCode).toHaveBeenCalledWith("user-1", "x");
    expect(res.json).toHaveBeenCalledWith({ errors: [] });
  });

  it("postTest runs the model test for the caller", async () => {
    vi.mocked(testModel).mockResolvedValue({ outcome: "skip", reason: "r", stdout: "" });
    const res = mockResponse();
    await postTest(mockRequest({ params: { id: "m1" }, body: { text: "t" } }), res);
    expect(testModel).toHaveBeenCalledWith("user-1", "m1", { text: "t" });
    expect(res.json).toHaveBeenCalledWith({ outcome: "skip", reason: "r", stdout: "" });
  });
});
