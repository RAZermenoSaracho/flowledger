import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/create.service.js", () => ({
  registerUser: vi.fn()
}));

vi.mock("../../utils/refreshTokenCookie.js", () => ({
  buildRefreshTokenCookie: vi.fn()
}));

const { registerUser } = await import("../../services/create.service.js");
const { buildRefreshTokenCookie } = await import("../../utils/refreshTokenCookie.js");
const { register } = await import("../create.controller.js");

describe("register", () => {
  it("registers the user, sets the refresh cookie, and responds 201 without the password hash", async () => {
    vi.mocked(buildRefreshTokenCookie).mockReturnValue("flowledger_refresh_token=x");
    vi.mocked(registerUser).mockResolvedValue({
      token: "access-token",
      refreshToken: { token: "refresh-token", expiresAt: new Date() },
      user: { id: "user-1", email: "ada@example.com", passwordHash: "secret" }
    } as never);
    const res = mockResponse();

    await register(
      mockRequest({ body: { name: "Ada", email: "ada@example.com", password: "longenough" } }),
      res
    );

    expect(buildRefreshTokenCookie).toHaveBeenCalledWith(
      "refresh-token",
      expect.any(Date)
    );
    expect(res.setHeader).toHaveBeenCalledWith("Set-Cookie", "flowledger_refresh_token=x");
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      token: "access-token",
      user: { id: "user-1", email: "ada@example.com" }
    });
  });
});
