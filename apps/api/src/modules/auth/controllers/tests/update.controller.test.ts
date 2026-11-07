import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/update.service.js", () => ({
  rotateRefreshToken: vi.fn()
}));

vi.mock("../../utils/refreshTokenCookie.js", () => ({
  buildSessionCookies: vi.fn(),
  clearPresenceCookie: vi.fn(() => "presence=; Max-Age=0"),
  readRefreshTokenCookie: vi.fn()
}));

const { rotateRefreshToken } = await import("../../services/update.service.js");
const { buildSessionCookies, readRefreshTokenCookie } = await import("../../utils/refreshTokenCookie.js");
const { refresh } = await import("../update.controller.js");
const { HttpError } = await import("../../../../utils/httpError.js");

describe("refresh", () => {
  it("throws a 401 when there's no refresh token cookie", async () => {
    vi.mocked(readRefreshTokenCookie).mockReturnValue(undefined);

    const res = mockResponse();

    await expect(refresh(mockRequest({ headers: {} } as never), res)).rejects.toThrow(
      "No refresh token"
    );
    expect(rotateRefreshToken).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith("Set-Cookie", "presence=; Max-Age=0");
  });

  it("expires only the presence cookie when the token is rejected", async () => {
    vi.mocked(readRefreshTokenCookie).mockReturnValue("old-plaintext");
    vi.mocked(rotateRefreshToken).mockRejectedValue(new HttpError(401, "Invalid"));
    const res = mockResponse();

    await expect(refresh(mockRequest({ headers: {} } as never), res)).rejects.toThrow("Invalid");
    expect(res.setHeader).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith("Set-Cookie", "presence=; Max-Age=0");
  });

  it("leaves cookies alone on a temporary failure", async () => {
    vi.mocked(readRefreshTokenCookie).mockReturnValue("old-plaintext");
    vi.mocked(rotateRefreshToken).mockRejectedValue(new Error("db down"));
    const res = mockResponse();

    await expect(refresh(mockRequest({ headers: {} } as never), res)).rejects.toThrow("db down");
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it("rotates the token, sets the new cookie, and responds with a fresh token", async () => {
    vi.mocked(readRefreshTokenCookie).mockReturnValue("old-plaintext");
    vi.mocked(rotateRefreshToken).mockResolvedValue({
      token: "new-access-token",
      refreshToken: { token: "new-refresh-token", expiresAt: new Date(), persistent: false },
      user: { id: "user-1", email: "ada@example.com", passwordHash: "secret" }
    } as never);
    vi.mocked(buildSessionCookies).mockReturnValue(["refresh=x", "presence=1"]);
    const res = mockResponse();

    await refresh(mockRequest({ headers: { cookie: "x=1" } } as never), res);

    expect(buildSessionCookies).toHaveBeenCalledWith(
      expect.objectContaining({ token: "new-refresh-token", persistent: false })
    );
    expect(res.setHeader).toHaveBeenCalledWith("Set-Cookie", ["refresh=x", "presence=1"]);
    expect(rotateRefreshToken).toHaveBeenCalledWith("old-plaintext");
    expect(res.json).toHaveBeenCalledWith({
      token: "new-access-token",
      user: { id: "user-1", email: "ada@example.com" }
    });
  });
});
