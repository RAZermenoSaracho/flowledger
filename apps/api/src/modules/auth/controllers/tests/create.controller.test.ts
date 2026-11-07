import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/create.service.js", () => ({
  registerUser: vi.fn()
}));

vi.mock("../../utils/refreshTokenCookie.js", () => ({
  buildSessionCookies: vi.fn()
}));

const { registerUser } = await import("../../services/create.service.js");
const { buildSessionCookies } = await import("../../utils/refreshTokenCookie.js");
const { register } = await import("../create.controller.js");

describe("register", () => {
  it("registers the user, sets both session cookies, and responds 201 without the password hash", async () => {
    vi.mocked(buildSessionCookies).mockReturnValue(["refresh=x", "presence=1"]);
    vi.mocked(registerUser).mockResolvedValue({
      token: "access-token",
      refreshToken: { token: "refresh-token", expiresAt: new Date(), persistent: true },
      user: { id: "user-1", email: "ada@example.com", passwordHash: "secret" }
    } as never);
    const res = mockResponse();

    await register(
      mockRequest({ body: { name: "Ada", email: "ada@example.com", password: "longenough" } }),
      res
    );

    expect(buildSessionCookies).toHaveBeenCalledWith({
      token: "refresh-token",
      expiresAt: expect.any(Date),
      persistent: true
    });
    expect(res.setHeader).toHaveBeenCalledWith("Set-Cookie", ["refresh=x", "presence=1"]);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      token: "access-token",
      user: { id: "user-1", email: "ada@example.com" }
    });
  });
});
