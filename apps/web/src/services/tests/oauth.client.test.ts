import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../tests/mocks/server";
import {
  getConsentContext,
  listOAuthGrants,
  revokeOAuthGrant,
  submitConsentDecision
} from "../oauth.client";

const API = "http://localhost:4000";

describe("oauth.client", () => {
  it("fetches consent context with the req query", async () => {
    let seen: string | null = null;
    server.use(
      http.get(`${API}/oauth/authorize/context`, ({ request }) => {
        seen = new URL(request.url).searchParams.get("req");
        return HttpResponse.json({
          client: { name: "App", redirectHost: "app.example" },
          scopes: { requested: ["read"] },
          user: { email: "a@b.c" }
        });
      })
    );
    const ctx = await getConsentContext("signed.jwt");
    expect(seen).toBe("signed.jwt");
    expect(ctx.client.name).toBe("App");
  });

  it("posts the decision and returns the redirect URL", async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/oauth/authorize/decision`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ redirectUrl: "https://app.example/cb?code=1" });
      })
    );
    const input = { req: "r", approve: true, allowWrite: false, lifetime: "1m" as const };
    expect(await submitConsentDecision(input)).toEqual({ redirectUrl: "https://app.example/cb?code=1" });
    expect(body).toEqual(input);
  });

  it("lists and revokes grants", async () => {
    let deleted = "";
    server.use(
      http.get(`${API}/users/me/oauth-grants`, () => HttpResponse.json({ grants: [] })),
      http.delete(`${API}/users/me/oauth-grants/:id`, ({ params }) => {
        deleted = String(params.id);
        return new HttpResponse(null, { status: 204 });
      })
    );
    expect(await listOAuthGrants()).toEqual({ grants: [] });
    await revokeOAuthGrant("g1");
    expect(deleted).toBe("g1");
  });
});
