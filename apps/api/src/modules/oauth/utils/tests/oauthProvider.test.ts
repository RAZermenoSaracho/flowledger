import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { env } from "../../../../config/env.js";
import { verifyConsentRequest } from "../consentRequest.js";
import { mcpResourceUrl } from "../tokens.js";

const getCimdClient = vi.hoisted(() => vi.fn());
vi.mock("../../providers/cimd/services/read.service.js", () => ({ getCimdClient }));

import { oauthServerProvider } from "../oauthProvider.js";

const client = { client_id: "https://app.example/c.json", redirect_uris: ["https://app.example/cb"] };
const params = (over = {}) => ({
  codeChallenge: "ch",
  redirectUri: "https://app.example/cb",
  state: "s",
  scopes: ["read", "write", "offline_access", "bogus"],
  resource: new URL(mcpResourceUrl()),
  ...over
});

describe("oauthServerProvider.authorize", () => {
  it("redirects to the SPA with a signed request carrying only known scopes", async () => {
    const res = { redirect: vi.fn() } as unknown as Response;

    await oauthServerProvider.authorize(client, params(), res);

    const location = new URL(vi.mocked(res.redirect).mock.calls[0]![0] as string);
    expect(location.origin + location.pathname).toBe(`${env.WEB_APP_URL}/oauth/authorize`);
    expect(verifyConsentRequest(location.searchParams.get("req")!)).toEqual({
      cid: client.client_id,
      ru: "https://app.example/cb",
      cc: "ch",
      st: "s",
      sc: ["read", "write"],
      rs: mcpResourceUrl()
    });
  });

  it("requires the MCP resource", async () => {
    const res = { redirect: vi.fn() } as unknown as Response;

    for (const resource of [undefined, new URL("https://other.example/mcp"), new URL(new URL(mcpResourceUrl()).origin + "/")]) {
      await expect(oauthServerProvider.authorize(client, params({ resource }), res)).rejects.toMatchObject({
        errorCode: "invalid_target"
      });
    }
    expect(res.redirect).not.toHaveBeenCalled();
  });
});

describe("oauthServerProvider.clientsStore", () => {
  it("only resolves clients (no registration)", async () => {
    getCimdClient.mockResolvedValue(client);
    expect(await oauthServerProvider.clientsStore.getClient(client.client_id)).toBe(client);
    expect(oauthServerProvider.clientsStore.registerClient).toBeUndefined();
  });
});
