import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/read.service.js", () => ({
  authenticateUser: vi.fn(),
  getCurrentUser: vi.fn()
}));

vi.mock("../../utils/refreshTokenCookie.js", () => ({
  buildSessionCookies: vi.fn()
}));

const { authenticateUser, getCurrentUser } = await import(
  "../../services/read.service.js"
);
const { buildSessionCookies } = await import("../../utils/refreshTokenCookie.js");
const { login, getMe } = await import("../read.controller.js");

describe("login", () => {
  it("authenticates, sets both session cookies, and responds with a token and public user", async () => {
    vi.mocked(buildSessionCookies).mockReturnValue(["refresh=x", "presence=1"]);
    vi.mocked(authenticateUser).mockResolvedValue({
      token: "access-token",
      refreshToken: { token: "refresh-token", expiresAt: new Date(), persistent: false },
      user: { id: "user-1", email: "ada@example.com", passwordHash: "secret" }
    } as never);
    const res = mockResponse();

    await login(
      mockRequest({ body: { email: "ada@example.com", password: "correct" } }),
      res
    );

    expect(buildSessionCookies).toHaveBeenCalledWith(
      expect.objectContaining({ persistent: false })
    );
    expect(res.setHeader).toHaveBeenCalledWith("Set-Cookie", ["refresh=x", "presence=1"]);
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
