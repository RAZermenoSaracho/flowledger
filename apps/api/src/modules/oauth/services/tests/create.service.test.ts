import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { signConsentRequest } from "../../utils/consentRequest.js";
import { hashToken, issuerUrl, mcpResourceUrl } from "../../utils/tokens.js";

const getCimdClient = vi.hoisted(() => vi.fn());
vi.mock("../../providers/cimd/services/read.service.js", () => ({ getCimdClient }));

import { decideConsent } from "../create.service.js";

const CID = "https://app.example/c.json";
const req = (over = {}) =>
  signConsentRequest({ cid: CID, ru: "https://app.example/cb", cc: "ch", st: "st1", sc: ["read", "write"], rs: mcpResourceUrl(), ...over });
const input = (over = {}) => ({ req: req(), approve: true, allowWrite: false, lifetime: "1m" as const, ...over });

beforeEach(() => {
  getCimdClient.mockResolvedValue({
    client_id: CID,
    client_name: "Test App",
    redirect_uris: ["https://app.example/cb", "http://localhost/callback"]
  });
  prismaMock.oAuthGrant.create.mockResolvedValue({} as never);
});

describe("decideConsent", () => {
  it("creates a read-only grant for the deciding user and redirects with code, state and iss", async () => {
    const { redirectUrl } = await decideConsent("u1", input());

    const url = new URL(redirectUrl);
    expect(url.origin + url.pathname).toBe("https://app.example/cb");
    expect(url.searchParams.get("state")).toBe("st1");
    expect(url.searchParams.get("iss")).toBe(issuerUrl());
    const code = url.searchParams.get("code")!;

    const { data } = prismaMock.oAuthGrant.create.mock.calls[0]![0];
    expect(data).toMatchObject({
      userId: "u1",
      clientId: CID,
      clientName: "Test App",
      redirectUri: "https://app.example/cb",
      scopes: ["read"],
      codeChallenge: "ch",
      codeHash: hashToken(code)
    });
    expect(JSON.stringify(data)).not.toContain(code);
    expect((data.codeExpiresAt as Date).getTime() - Date.now()).toBeLessThanOrEqual(60_000);
  });

  it("grants write only when requested and allowed", async () => {
    await decideConsent("u1", input({ allowWrite: true }));
    expect(prismaMock.oAuthGrant.create.mock.calls[0]![0].data.scopes).toEqual(["read", "write"]);

    await decideConsent("u1", input({ allowWrite: true, req: req({ sc: ["read"] }) }));
    expect(prismaMock.oAuthGrant.create.mock.calls[1]![0].data.scopes).toEqual(["read"]);
  });

  it("applies the chosen lifetime, with null for never", async () => {
    await decideConsent("u1", input({ lifetime: "never" }));
    expect(prismaMock.oAuthGrant.create.mock.calls[0]![0].data.expiresAt).toBeNull();
    await decideConsent("u1", input({ lifetime: "1d" }));
    expect(prismaMock.oAuthGrant.create.mock.calls[1]![0].data.expiresAt).toBeInstanceOf(Date);
  });

  it("denies with access_denied, state and iss and creates nothing", async () => {
    const { redirectUrl } = await decideConsent("u1", input({ approve: false }));
    const url = new URL(redirectUrl);
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe("st1");
    expect(url.searchParams.get("iss")).toBe(issuerUrl());
    expect(url.searchParams.has("code")).toBe(false);
    expect(prismaMock.oAuthGrant.create).not.toHaveBeenCalled();
  });

  it("accepts a loopback redirect on any port", async () => {
    const { redirectUrl } = await decideConsent("u1", input({ req: req({ ru: "http://localhost:53124/callback" }) }));
    expect(redirectUrl.startsWith("http://localhost:53124/callback?")).toBe(true);
  });

  it("rejects a tampered request, a vanished client, and a redirect no longer registered", async () => {
    await expect(decideConsent("u1", input({ req: "bad" }))).rejects.toMatchObject({ statusCode: 400 });

    getCimdClient.mockResolvedValue(undefined);
    await expect(decideConsent("u1", input())).rejects.toMatchObject({ statusCode: 400 });

    getCimdClient.mockResolvedValue({ client_id: CID, redirect_uris: ["https://app.example/changed"] });
    await expect(decideConsent("u1", input())).rejects.toMatchObject({ statusCode: 400 });
    await expect(decideConsent("u1", input({ approve: false }))).rejects.toMatchObject({ statusCode: 400 });
    expect(prismaMock.oAuthGrant.create).not.toHaveBeenCalled();
  });
});
