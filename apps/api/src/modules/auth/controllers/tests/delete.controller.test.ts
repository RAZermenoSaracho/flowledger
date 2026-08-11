import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/delete.service.js", () => ({
  revokeRefreshToken: vi.fn()
}));

vi.mock("../../utils/refreshTokenCookie.js", () => ({
  clearRefreshTokenCookie: vi.fn(),
  readRefreshTokenCookie: vi.fn()
}));

const { revokeRefreshToken } = await import("../../services/delete.service.js");
const { clearRefreshTokenCookie, readRefreshTokenCookie } = await import(
  "../../utils/refreshTokenCookie.js"
);
const { logout } = await import("../delete.controller.js");

describe("logout", () => {
  it("revokes the refresh token when a cookie is present, clears the cookie, and responds 204", async () => {
    vi.mocked(clearRefreshTokenCookie).mockReturnValue("cleared");
    vi.mocked(readRefreshTokenCookie).mockReturnValue("plaintext-token");
    vi.mocked(revokeRefreshToken).mockResolvedValue(undefined);
    const res = mockResponse();

    await logout(mockRequest({ headers: { cookie: "x=1" } } as never), res);

    expect(revokeRefreshToken).toHaveBeenCalledWith("plaintext-token");
    expect(res.setHeader).toHaveBeenCalledWith("Set-Cookie", "cleared");
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it("still succeeds (204) with no cookie present, without calling revokeRefreshToken", async () => {
    vi.mocked(readRefreshTokenCookie).mockReturnValue(undefined);
    const res = mockResponse();

    await logout(mockRequest({ headers: {} } as never), res);

    expect(revokeRefreshToken).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
