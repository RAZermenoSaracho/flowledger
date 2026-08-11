import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { hashRefreshToken } from "../../utils/tokens.js";
import { revokeRefreshToken } from "../delete.service.js";

describe("revokeRefreshToken", () => {
  it("revokes the unrevoked token matching the hashed plaintext value", async () => {
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 } as never);

    await revokeRefreshToken("plaintext-token");

    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        tokenHash: hashRefreshToken("plaintext-token"),
        revokedAt: null
      },
      data: { revokedAt: expect.any(Date) }
    });
  });

  it("is a no-op (no throw) when no matching unrevoked token exists", async () => {
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 0 } as never);

    await expect(revokeRefreshToken("unknown-token")).resolves.toBeUndefined();
  });
});
