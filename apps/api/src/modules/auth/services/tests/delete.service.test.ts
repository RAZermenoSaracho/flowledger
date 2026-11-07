import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { hashRefreshToken } from "../../utils/tokens.js";
import { revokeRefreshToken } from "../delete.service.js";

describe("revokeRefreshToken", () => {
  it("looks the token up by hash and revokes it, its predecessor, and tokens issued from it", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: "rt-1",
      userId: "u-1",
      previousTokenId: "rt-0"
    } as never);
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 2 } as never);

    await revokeRefreshToken("plaintext-token");

    expect(prismaMock.refreshToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashRefreshToken("plaintext-token") },
      select: { id: true, userId: true, previousTokenId: true }
    });
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "u-1",
        revokedAt: null,
        OR: [{ id: { in: ["rt-1", "rt-0"] } }, { previousTokenId: "rt-1" }]
      },
      data: { revokedAt: expect.any(Date) }
    });
  });

  it("never matches other root sessions when there is no predecessor", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: "rt-1",
      userId: "u-1",
      previousTokenId: null
    } as never);
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 } as never);

    await revokeRefreshToken("plaintext-token");

    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "u-1",
        revokedAt: null,
        OR: [{ id: { in: ["rt-1"] } }, { previousTokenId: "rt-1" }]
      },
      data: { revokedAt: expect.any(Date) }
    });
  });

  it("is a no-op for an unknown token", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue(null);

    await expect(revokeRefreshToken("unknown-token")).resolves.toBeUndefined();
    expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("still revokes the predecessor when the token itself is already revoked", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: "rt-1",
      userId: "u-1",
      previousTokenId: "rt-0"
    } as never);
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 } as never);

    await revokeRefreshToken("already-revoked");

    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "u-1",
        revokedAt: null,
        OR: [{ id: { in: ["rt-1", "rt-0"] } }, { previousTokenId: "rt-1" }]
      },
      data: { revokedAt: expect.any(Date) }
    });
  });
});
