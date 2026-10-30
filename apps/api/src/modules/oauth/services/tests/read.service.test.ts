import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { signConsentRequest } from "../../utils/consentRequest.js";
import { hashToken, mcpResourceUrl } from "../../utils/tokens.js";

const getCimdClient = vi.hoisted(() => vi.fn());
vi.mock("../../providers/cimd/services/read.service.js", () => ({ getCimdClient }));

import { getCodeChallenge, getConsentContext, listOAuthGrants } from "../read.service.js";

const claims = (sc: string[]) =>
  signConsentRequest({ cid: "https://app.example/c.json", ru: "https://app.example/cb", cc: "ch", sc, rs: mcpResourceUrl() });

describe("getConsentContext", () => {
  beforeEach(() => getCimdClient.mockResolvedValue({ client_id: "x", client_name: "Test App", redirect_uris: [] }));

  it("shows the client, redirect host, requested scopes and the user", async () => {
    expect(await getConsentContext("u@example.com", claims(["read", "write"]))).toEqual({
      client: { name: "Test App", redirectHost: "app.example" },
      scopes: { requested: ["read", "write"] },
      user: { email: "u@example.com" }
    });
    expect((await getConsentContext("u@example.com", claims(["read"]))).scopes.requested).toEqual(["read"]);
  });

  it("rejects a bad request token or a client that can no longer be resolved", async () => {
    await expect(getConsentContext("u", "garbage")).rejects.toMatchObject({ statusCode: 400 });
    getCimdClient.mockResolvedValue(undefined);
    await expect(getConsentContext("u", claims(["read"]))).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("listOAuthGrants", () => {
  it("lists only the user's completed, live grants and adds the redirect host", async () => {
    prismaMock.oAuthGrant.findMany.mockResolvedValue([
      { id: "g1", redirectUri: "http://localhost:5555/callback", clientName: "A" }
    ] as never);

    const grants = await listOAuthGrants("u1");

    const args = prismaMock.oAuthGrant.findMany.mock.calls[0]![0]!;
    expect(args.where).toMatchObject({ userId: "u1", codeUsedAt: { not: null }, revokedAt: null });
    expect(JSON.stringify(args.select)).not.toMatch(/Hash/);
    expect(grants).toEqual([{ id: "g1", clientName: "A", redirectHost: "localhost:5555" }]);
  });
});

describe("getCodeChallenge", () => {
  const grant = { id: "g1", clientId: "c1", codeChallenge: "ch", codeUsedAt: null, revokedAt: null, codeExpiresAt: new Date(Date.now() + 60_000) };

  it("returns the challenge of a fresh code, looked up by hash", async () => {
    prismaMock.oAuthGrant.findUnique.mockResolvedValue(grant as never);
    expect(await getCodeChallenge("c1", "flc_x")).toBe("ch");
    expect(prismaMock.oAuthGrant.findUnique.mock.calls[0]![0]).toEqual({ where: { codeHash: hashToken("flc_x") } });
  });

  it("rejects unknown, foreign, expired and revoked codes", async () => {
    prismaMock.oAuthGrant.findUnique.mockResolvedValue(null);
    await expect(getCodeChallenge("c1", "x")).rejects.toMatchObject({ errorCode: "invalid_grant" });
    prismaMock.oAuthGrant.findUnique.mockResolvedValue(grant as never);
    await expect(getCodeChallenge("c2", "x")).rejects.toMatchObject({ errorCode: "invalid_grant" });
    prismaMock.oAuthGrant.findUnique.mockResolvedValue({ ...grant, codeExpiresAt: new Date(0) } as never);
    await expect(getCodeChallenge("c1", "x")).rejects.toMatchObject({ errorCode: "invalid_grant" });
    prismaMock.oAuthGrant.findUnique.mockResolvedValue({ ...grant, revokedAt: new Date() } as never);
    await expect(getCodeChallenge("c1", "x")).rejects.toMatchObject({ errorCode: "invalid_grant" });
    expect(prismaMock.oAuthGrant.updateMany).not.toHaveBeenCalled();
  });

  it("revokes the grant when a used code is presented again", async () => {
    prismaMock.oAuthGrant.findUnique.mockResolvedValue({ ...grant, codeUsedAt: new Date() } as never);
    prismaMock.oAuthGrant.updateMany.mockResolvedValue({ count: 1 });

    await expect(getCodeChallenge("c1", "x")).rejects.toMatchObject({ errorCode: "invalid_grant" });
    expect(prismaMock.oAuthGrant.updateMany.mock.calls[0]![0].where).toEqual({ id: "g1", revokedAt: null });
  });
});
