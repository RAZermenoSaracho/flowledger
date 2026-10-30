import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { hashToken, mcpResourceUrl } from "../../utils/tokens.js";
import { exchangeAuthorizationCode, exchangeRefreshToken } from "../update.service.js";

const NOW = new Date("2026-03-01T12:00:00Z");
const resource = new URL(mcpResourceUrl());
const grantBase = {
  id: "g1",
  clientId: "c1",
  redirectUri: "https://app.example/cb",
  scopes: ["read"],
  expiresAt: new Date("2026-04-01T00:00:00Z"),
  revokedAt: null,
  codeUsedAt: null,
  refreshTokenHash: hashToken("flr_current"),
  prevRefreshTokenHash: null,
  rotatedAt: null
};

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});
afterEach(() => vi.useRealTimers());

describe("exchangeAuthorizationCode", () => {
  it("claims the code atomically and returns a token pair", async () => {
    prismaMock.oAuthGrant.findUnique.mockResolvedValue(grantBase as never);
    prismaMock.oAuthGrant.updateMany.mockResolvedValue({ count: 1 });

    const tokens = await exchangeAuthorizationCode("c1", "flc_code", grantBase.redirectUri, resource);

    expect(tokens).toMatchObject({ token_type: "Bearer", scope: "read", expires_in: 3600 });
    expect(tokens.access_token).toMatch(/^flo_/);
    expect(tokens.refresh_token).toMatch(/^flr_/);
    const call = prismaMock.oAuthGrant.updateMany.mock.calls[0]![0];
    expect(call.where).toMatchObject({
      codeHash: hashToken("flc_code"),
      codeUsedAt: null,
      revokedAt: null,
      clientId: "c1"
    });
    expect(call.data).toMatchObject({
      codeUsedAt: NOW,
      accessTokenHash: hashToken(tokens.access_token),
      refreshTokenHash: hashToken(tokens.refresh_token!),
      rotatedAt: null
    });
  });

  it("caps expires_in at the grant expiry", async () => {
    prismaMock.oAuthGrant.findUnique.mockResolvedValue({ ...grantBase, expiresAt: new Date(NOW.getTime() + 600_000) } as never);
    prismaMock.oAuthGrant.updateMany.mockResolvedValue({ count: 1 });

    expect((await exchangeAuthorizationCode("c1", "c", grantBase.redirectUri, resource)).expires_in).toBe(600);
  });

  it("rejects a missing or wrong resource", async () => {
    await expect(exchangeAuthorizationCode("c1", "c", grantBase.redirectUri, undefined)).rejects.toMatchObject({ errorCode: "invalid_target" });
    await expect(
      exchangeAuthorizationCode("c1", "c", grantBase.redirectUri, new URL("https://other.example/mcp"))
    ).rejects.toMatchObject({ errorCode: "invalid_target" });
  });

  it("rejects unknown codes, another client and a different redirect URI", async () => {
    prismaMock.oAuthGrant.findUnique.mockResolvedValue(null);
    await expect(exchangeAuthorizationCode("c1", "c", grantBase.redirectUri, resource)).rejects.toMatchObject({ errorCode: "invalid_grant" });

    prismaMock.oAuthGrant.findUnique.mockResolvedValue(grantBase as never);
    await expect(exchangeAuthorizationCode("c2", "c", grantBase.redirectUri, resource)).rejects.toMatchObject({ errorCode: "invalid_grant" });
    await expect(exchangeAuthorizationCode("c1", "c", "https://app.example/other", resource)).rejects.toMatchObject({ errorCode: "invalid_grant" });
    await expect(exchangeAuthorizationCode("c1", "c", undefined, resource)).rejects.toMatchObject({ errorCode: "invalid_grant" });
    expect(prismaMock.oAuthGrant.updateMany).not.toHaveBeenCalled();
  });

  it("revokes the grant when it lost the claim to an earlier use (replay or race)", async () => {
    prismaMock.oAuthGrant.findUnique
      .mockResolvedValueOnce(grantBase as never)
      .mockResolvedValueOnce({ ...grantBase, codeUsedAt: NOW } as never);
    prismaMock.oAuthGrant.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

    await expect(exchangeAuthorizationCode("c1", "c", grantBase.redirectUri, resource)).rejects.toMatchObject({ errorCode: "invalid_grant" });
    expect(prismaMock.oAuthGrant.updateMany.mock.calls[1]![0]).toMatchObject({ where: { id: "g1", revokedAt: null } });
  });

  it("does not revoke when the claim failed for expiry reasons only", async () => {
    prismaMock.oAuthGrant.findUnique.mockResolvedValue(grantBase as never);
    prismaMock.oAuthGrant.updateMany.mockResolvedValue({ count: 0 });

    await expect(exchangeAuthorizationCode("c1", "c", grantBase.redirectUri, resource)).rejects.toMatchObject({ errorCode: "invalid_grant" });
    expect(prismaMock.oAuthGrant.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("exchangeRefreshToken", () => {
  const hash = hashToken("flr_current");

  it("rotates atomically on the current hash and never touches the grant expiry", async () => {
    prismaMock.oAuthGrant.findFirst.mockResolvedValue(grantBase as never);
    prismaMock.oAuthGrant.updateMany.mockResolvedValue({ count: 1 });

    const tokens = await exchangeRefreshToken("c1", "flr_current", ["read"], resource);

    expect(tokens.refresh_token).not.toBe("flr_current");
    const call = prismaMock.oAuthGrant.updateMany.mock.calls[0]![0];
    expect(call.where).toMatchObject({ id: "g1", refreshTokenHash: hash, revokedAt: null });
    expect(call.data).toMatchObject({ prevRefreshTokenHash: hash, rotatedAt: NOW });
    expect(call.data).not.toHaveProperty("expiresAt");
  });

  it("keeps issuing hour-long tokens for a Never grant", async () => {
    prismaMock.oAuthGrant.findFirst.mockResolvedValue({ ...grantBase, expiresAt: null } as never);
    prismaMock.oAuthGrant.updateMany.mockResolvedValue({ count: 1 });

    expect((await exchangeRefreshToken("c1", "flr_current", undefined, undefined)).expires_in).toBe(3600);
  });

  it("caps the new access token at the grant expiry", async () => {
    prismaMock.oAuthGrant.findFirst.mockResolvedValue({ ...grantBase, expiresAt: new Date(NOW.getTime() + 600_000) } as never);
    prismaMock.oAuthGrant.updateMany.mockResolvedValue({ count: 1 });

    expect((await exchangeRefreshToken("c1", "flr_current", undefined, undefined)).expires_in).toBe(600);
  });

  it("rejects unknown tokens, another client, scope widening and a wrong resource without writing", async () => {
    prismaMock.oAuthGrant.findFirst.mockResolvedValue(null);
    await expect(exchangeRefreshToken("c1", "flr_x", undefined, undefined)).rejects.toMatchObject({ errorCode: "invalid_grant" });

    prismaMock.oAuthGrant.findFirst.mockResolvedValue(grantBase as never);
    await expect(exchangeRefreshToken("c2", "flr_current", undefined, undefined)).rejects.toMatchObject({ errorCode: "invalid_grant" });
    await expect(exchangeRefreshToken("c1", "flr_current", ["read", "write"], undefined)).rejects.toMatchObject({ errorCode: "invalid_scope" });
    await expect(exchangeRefreshToken("c1", "flr_current", undefined, new URL("https://o.example/mcp"))).rejects.toMatchObject({ errorCode: "invalid_target" });
    expect(prismaMock.oAuthGrant.updateMany).not.toHaveBeenCalled();
  });

  it("accepts offline_access in a requested scope", async () => {
    prismaMock.oAuthGrant.findFirst.mockResolvedValue(grantBase as never);
    prismaMock.oAuthGrant.updateMany.mockResolvedValue({ count: 1 });
    await expect(exchangeRefreshToken("c1", "flr_current", ["read", "offline_access"], undefined)).resolves.toBeDefined();
  });

  describe("previous token presented (rotation lost)", () => {
    const prev = (ageMs: number, extra = {}) =>
      ({ ...grantBase, refreshTokenHash: "other-racer-hash", prevRefreshTokenHash: hash, rotatedAt: new Date(NOW.getTime() - ageMs), ...extra }) as never;

    it("re-issues a fresh pair within 30 s, chaining the other racer's token as the new previous", async () => {
      prismaMock.oAuthGrant.findFirst.mockResolvedValueOnce(prev(5_000)).mockResolvedValueOnce(prev(5_000));
      prismaMock.oAuthGrant.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

      const tokens = await exchangeRefreshToken("c1", "flr_current", undefined, undefined);

      expect(tokens.refresh_token).toMatch(/^flr_/);
      const call = prismaMock.oAuthGrant.updateMany.mock.calls[1]![0];
      expect(call.where).toMatchObject({ id: "g1", prevRefreshTokenHash: hash, refreshTokenHash: "other-racer-hash", revokedAt: null });
      expect(call.data).toMatchObject({ prevRefreshTokenHash: "other-racer-hash", rotatedAt: NOW });
      expect(call.data).not.toHaveProperty("expiresAt");
    });

    it("revokes the grant on reuse after 30 s", async () => {
      prismaMock.oAuthGrant.findFirst.mockResolvedValueOnce(prev(120_000)).mockResolvedValueOnce(prev(120_000));
      prismaMock.oAuthGrant.updateMany.mockResolvedValue({ count: 0 });

      await expect(exchangeRefreshToken("c1", "flr_current", undefined, undefined)).rejects.toMatchObject({ errorCode: "invalid_grant" });
      expect(prismaMock.oAuthGrant.updateMany.mock.calls[1]![0]).toMatchObject({ where: { id: "g1", revokedAt: null }, data: { revokedAt: NOW } });
    });

    it("fails without revoking when the grace update loses to another rotation", async () => {
      prismaMock.oAuthGrant.findFirst.mockResolvedValueOnce(prev(1_000)).mockResolvedValueOnce(prev(1_000));
      prismaMock.oAuthGrant.updateMany.mockResolvedValue({ count: 0 });

      await expect(exchangeRefreshToken("c1", "flr_current", undefined, undefined)).rejects.toMatchObject({ errorCode: "invalid_grant" });
      expect(prismaMock.oAuthGrant.updateMany).toHaveBeenCalledTimes(2);
      expect(prismaMock.oAuthGrant.updateMany.mock.calls[1]![0].data).not.toHaveProperty("revokedAt");
    });

    it("fails for a revoked or expired grant and when no previous match exists", async () => {
      prismaMock.oAuthGrant.updateMany.mockResolvedValue({ count: 0 });

      prismaMock.oAuthGrant.findFirst.mockResolvedValueOnce(grantBase as never).mockResolvedValueOnce(null);
      await expect(exchangeRefreshToken("c1", "flr_current", undefined, undefined)).rejects.toMatchObject({ errorCode: "invalid_grant" });

      prismaMock.oAuthGrant.findFirst.mockResolvedValueOnce(grantBase as never).mockResolvedValueOnce(prev(1_000, { revokedAt: NOW }));
      await expect(exchangeRefreshToken("c1", "flr_current", undefined, undefined)).rejects.toMatchObject({ errorCode: "invalid_grant" });
      expect(prismaMock.oAuthGrant.updateMany).toHaveBeenCalledTimes(2);
    });
  });
});
