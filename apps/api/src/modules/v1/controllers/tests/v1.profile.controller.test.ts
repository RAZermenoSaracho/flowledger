import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

const updatePreferences = vi.fn();
vi.mock("../../../users/services/preferences.service.js", () => ({ updatePreferences }));

const { patchV1Me } = await import("../v1.profile.controller.js");

describe("patchV1Me", () => {
  it("updates preferences for the credential's user and strips passwordHash", async () => {
    updatePreferences.mockResolvedValue({ id: "u1", name: "Ada", passwordHash: "secret" });
    const res = mockResponse();

    await patchV1Me(mockRequest({ user: { id: "u1", email: "a@b.c" }, body: { name: "Ada" } }), res);

    expect(updatePreferences).toHaveBeenCalledWith("u1", { name: "Ada" });
    expect(res.json).toHaveBeenCalledWith({ user: { id: "u1", name: "Ada" } });
  });
});
