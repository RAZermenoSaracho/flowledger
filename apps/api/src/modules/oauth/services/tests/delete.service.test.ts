import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { hashToken } from "../../utils/tokens.js";
import { revokeGrantById, revokeOAuthGrant, revokeToken } from "../delete.service.js";

describe("revokeGrantById", () => {
  it("sets revokedAt only on a not-yet-revoked grant", async () => {
    prismaMock.oAuthGrant.updateMany.mockResolvedValue({ count: 1 });
    await revokeGrantById("g1");
    expect(prismaMock.oAuthGrant.updateMany.mock.calls[0]![0].where).toEqual({ id: "g1", revokedAt: null });
  });
});

describe("revokeToken", () => {
  it("matches any of the grant's token hashes, scoped to the calling client", async () => {
    prismaMock.oAuthGrant.updateMany.mockResolvedValue({ count: 0 });
    const hash = hashToken("flr_x");

    await expect(revokeToken("c1", "flr_x")).resolves.toBeUndefined();

    expect(prismaMock.oAuthGrant.updateMany.mock.calls[0]![0].where).toEqual({
      clientId: "c1",
      revokedAt: null,
      OR: [{ accessTokenHash: hash }, { refreshTokenHash: hash }, { prevRefreshTokenHash: hash }]
    });
  });
});

describe("revokeOAuthGrant", () => {
  it("revokes with ownership in the where clause", async () => {
    prismaMock.oAuthGrant.updateMany.mockResolvedValue({ count: 1 });
    await revokeOAuthGrant("u1", "g1");
    expect(prismaMock.oAuthGrant.updateMany.mock.calls[0]![0].where).toEqual({ id: "g1", userId: "u1", revokedAt: null });
  });

  it("is idempotent when already revoked", async () => {
    prismaMock.oAuthGrant.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.oAuthGrant.findFirst.mockResolvedValue({ id: "g1" } as never);
    await expect(revokeOAuthGrant("u1", "g1")).resolves.toBeUndefined();
  });

  it("404s for another user's or unknown grant", async () => {
    prismaMock.oAuthGrant.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.oAuthGrant.findFirst.mockResolvedValue(null);
    await expect(revokeOAuthGrant("u2", "g1")).rejects.toMatchObject({ statusCode: 404 });
  });
});
