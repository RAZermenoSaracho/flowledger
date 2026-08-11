import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../create.service.js", () => ({
  issueRefreshToken: vi.fn()
}));

vi.mock("../read.service.js", () => ({
  getValidRefreshToken: vi.fn()
}));

const { issueRefreshToken } = await import("../create.service.js");
const { getValidRefreshToken } = await import("../read.service.js");
const issueRefreshTokenMock = vi.mocked(issueRefreshToken);
const getValidRefreshTokenMock = vi.mocked(getValidRefreshToken);

const { rotateRefreshToken } = await import("../update.service.js");

describe("rotateRefreshToken", () => {
  it("revokes the old token and issues a fresh access+refresh token pair", async () => {
    getValidRefreshTokenMock.mockResolvedValue({
      id: "rt-1",
      userId: "user-1",
      user: { id: "user-1", email: "ada@example.com" }
    } as never);
    prismaMock.refreshToken.update.mockResolvedValue({} as never);
    issueRefreshTokenMock.mockResolvedValue({
      token: "new-refresh-token",
      expiresAt: new Date()
    });

    const result = await rotateRefreshToken("old-plaintext");

    expect(prismaMock.refreshToken.update).toHaveBeenCalledWith({
      where: { id: "rt-1" },
      data: { revokedAt: expect.any(Date) }
    });
    expect(issueRefreshTokenMock).toHaveBeenCalledWith("user-1");
    expect(result.refreshToken.token).toBe("new-refresh-token");
    expect(typeof result.token).toBe("string");
  });

  it("propagates the 401 for an invalid/expired/revoked token without issuing a new one", async () => {
    getValidRefreshTokenMock.mockRejectedValue(
      new Error("Invalid or expired refresh token")
    );

    await expect(rotateRefreshToken("bad-token")).rejects.toThrow(
      "Invalid or expired refresh token"
    );
    expect(issueRefreshTokenMock).not.toHaveBeenCalled();
  });
});
