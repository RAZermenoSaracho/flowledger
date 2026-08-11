import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/read.service.js", () => ({
  authenticateUser: vi.fn(),
  getCurrentUser: vi.fn()
}));

vi.mock("../../utils/refreshTokenCookie.js", () => ({
  buildRefreshTokenCookie: vi.fn()
}));

const { authenticateUser, getCurrentUser } = await import(
  "../../services/read.service.js"
);
const { buildRefreshTokenCookie } = await import("../../utils/refreshTokenCookie.js");
const { login, getMe } = await import("../read.controller.js");

describe("login", () => {
  it("authenticates, sets the refresh cookie, and responds with a token and public user", async () => {
    vi.mocked(buildRefreshTokenCookie).mockReturnValue("flowledger_refresh_token=x");
    vi.mocked(authenticateUser).mockResolvedValue({
      token: "access-token",
      refreshToken: { token: "refresh-token", expiresAt: new Date() },
      user: { id: "user-1", email: "ada@example.com", passwordHash: "secret" }
    } as never);
    const res = mockResponse();

    await login(
      mockRequest({ body: { email: "ada@example.com", password: "correct" } }),
      res
    );

    expect(res.setHeader).toHaveBeenCalledWith("Set-Cookie", "flowledger_refresh_token=x");
    expect(res.json).toHaveBeenCalledWith({
      token: "access-token",
      user: { id: "user-1", email: "ada@example.com" }
    });
  });
});

describe("getMe", () => {
  it("returns the authenticated user's public profile", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user-1",
      email: "ada@example.com",
      passwordHash: "secret"
    } as never);
    const res = mockResponse();

    await getMe(mockRequest(), res);

    expect(getCurrentUser).toHaveBeenCalledWith("user-1");
    expect(res.json).toHaveBeenCalledWith({
      user: { id: "user-1", email: "ada@example.com" }
    });
  });
});
