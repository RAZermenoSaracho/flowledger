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

function validRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "rt-1",
    userId: "user-1",
    persistent: true,
    previousTokenId: null,
    user: { id: "user-1", email: "ada@example.com" },
    ...overrides
  } as never;
}

describe("rotateRefreshToken", () => {
  it("issues a successor that inherits persistent and links the presented token, without revoking it", async () => {
    getValidRefreshTokenMock.mockResolvedValue(validRecord({ persistent: false }));
    issueRefreshTokenMock.mockResolvedValue({
      token: "new-refresh-token",
      expiresAt: new Date(),
      persistent: false
    });

    const result = await rotateRefreshToken("old-plaintext");

    expect(issueRefreshTokenMock).toHaveBeenCalledWith("user-1", false, "rt-1");
    expect(prismaMock.refreshToken.update).not.toHaveBeenCalled();
    expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(result.refreshToken.token).toBe("new-refresh-token");
    expect(typeof result.token).toBe("string");
  });

  it("revokes only the presented token's predecessor via updateMany", async () => {
    getValidRefreshTokenMock.mockResolvedValue(validRecord({ previousTokenId: "rt-0" }));
    issueRefreshTokenMock.mockResolvedValue({
      token: "new",
      expiresAt: new Date(),
      persistent: true
    });
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 } as never);

    await rotateRefreshToken("old-plaintext");

    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: "rt-0", revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    });
    expect(prismaMock.refreshToken.update).not.toHaveBeenCalled();
  });

  it("propagates the 401 for an invalid/expired/revoked token without issuing a new one", async () => {
    getValidRefreshTokenMock.mockRejectedValue(
      new Error("Invalid or expired refresh token")
    );

    await expect(rotateRefreshToken("bad-token")).rejects.toThrow(
      "Invalid or expired refresh token"
    );
    expect(issueRefreshTokenMock).not.toHaveBeenCalled();
    expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
