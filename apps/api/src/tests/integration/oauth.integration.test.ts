import { createHash, randomBytes } from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAuthedUser } from "../helpers/authTestUser.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";

// Cross-module integration test: needs Docker (see CLAUDE.local.md). The CIMD fetch is replaced by a
// stub client store here; its SSRF behaviour has its own unit tests.
const CID = "https://app.example/client.json";
const REDIRECT = "https://app.example/cb";
vi.mock("../../modules/oauth/providers/cimd/services/read.service.js", () => ({
  getCimdClient: async (id: string) =>
    id === CID
      ? {
          client_id: CID,
          client_name: "Test App",
          redirect_uris: ["https://app.example/cb", "http://localhost/callback"],
          token_endpoint_auth_method: "none"
        }
      : undefined
}));

let app: Express;
let prisma: (typeof import("../../db/prisma.js"))["prisma"];
let resource: string;
let issuer: string;
let webUrl: string;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type AuthedUser = Awaited<ReturnType<typeof createAuthedUser>>;

const b64 = (b: Buffer) => b.toString("base64url");
const pkce = () => {
  const verifier = b64(randomBytes(32));
  return { verifier, challenge: b64(createHash("sha256").update(verifier).digest()) };
};

async function authorize(challenge: string, overrides: Json = {}) {
  return request(app)
    .get("/authorize")
    .query({
      client_id: CID,
      redirect_uri: REDIRECT,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "xyz",
      scope: "read write offline_access",
      resource,
      ...overrides
    });
}

async function consentReq(challenge: string) {
  const res = await authorize(challenge);
  expect(res.status).toBe(302);
  expect(res.headers.location).toMatch(new RegExp(`^${webUrl}/oauth/authorize\\?req=`));
  return new URL(res.headers.location!).searchParams.get("req")!;
}

async function decide(user: AuthedUser, req: string, body: Json = {}) {
  return request(app)
    .post("/oauth/authorize/decision")
    .set("Authorization", `Bearer ${user.token}`)
    .send({ req, approve: true, ...body });
}

const token = (body: Json) => request(app).post("/token").type("form").send({ client_id: CID, ...body });

/** Runs authorize -> decision and returns the code from the redirect URL. */
async function getCode(user: AuthedUser, challenge: string, body: Json = {}) {
  const res = await decide(user, await consentReq(challenge), body);
  expect(res.status).toBe(200);
  const url = new URL(res.body.redirectUrl);
  expect(url.searchParams.get("iss")).toBe(issuer);
  expect(url.searchParams.get("state")).toBe("xyz");
  return url.searchParams.get("code")!;
}

async function connect(user: AuthedUser, body: Json = {}) {
  const { verifier, challenge } = pkce();
  const code = await getCode(user, challenge, body);
  const res = await token({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: REDIRECT, resource });
  expect(res.status).toBe(200);
  return res.body as { access_token: string; refresh_token: string; expires_in: number; scope: string };
}

const refresh = (refreshToken: string, extra: Json = {}) =>
  token({ grant_type: "refresh_token", refresh_token: refreshToken, resource, ...extra });

const mcp = (accessToken: string) =>
  request(app)
    .post("/mcp")
    .set("Authorization", `Bearer ${accessToken}`)
    .set("Accept", "application/json, text/event-stream")
    .send({ jsonrpc: "2.0", id: 1, method: "tools/list" });

describe("MCP OAuth server", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
    ({ prisma } = await import("../../db/prisma.js"));
    const { env } = await import("../../config/env.js");
    issuer = env.PUBLIC_API_URL.replace(/\/+$/, "");
    resource = `${issuer}/mcp`;
    webUrl = env.WEB_APP_URL;
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  it("publishes discovery metadata without a registration endpoint", async () => {
    const as = await request(app).get("/.well-known/oauth-authorization-server");
    expect(as.body).toMatchObject({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      revocation_endpoint: `${issuer}/revoke`,
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
      scopes_supported: ["read", "write", "offline_access"]
    });
    expect(as.body.registration_endpoint).toBeUndefined();
    expect(as.headers["access-control-allow-origin"]).toBe("*");

    for (const path of ["/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"]) {
      const prm = await request(app).get(path);
      expect(prm.body).toMatchObject({ resource, authorization_servers: [issuer] });
    }
    expect((await request(app).post("/register").send({})).status).toBe(404);
  });

  it("answers an unauthenticated /mcp call with a resource_metadata challenge", async () => {
    const res = await request(app).post("/mcp").send({});
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toContain(`resource_metadata="${issuer}/.well-known/oauth-protected-resource/mcp"`);
  });

  it("completes the PKCE flow and the token works on /mcp (read grant: 4 tools) but not on /v1", async () => {
    const user = await createAuthedUser(app);
    const tokens = await connect(user, { lifetime: "1d" });

    expect(tokens.access_token).toMatch(/^flo_/);
    expect(tokens.refresh_token).toMatch(/^flr_/);
    expect(tokens.scope).toBe("read");
    expect(tokens.expires_in).toBeLessThanOrEqual(3600);

    const list = await mcp(tokens.access_token);
    expect(list.status).toBe(200);
    expect((await request(app).get("/v1/accounts").set("Authorization", `Bearer ${tokens.access_token}`)).status).toBe(401);
    expect((await mcp(tokens.refresh_token)).status).toBe(401);
  });

  it("grants write only when requested and allowed", async () => {
    const user = await createAuthedUser(app);
    expect((await connect(user, { allowWrite: true })).scope).toBe("read write");
    expect((await connect(user, { allowWrite: false })).scope).toBe("read");
  });

  it("denies with access_denied, state and iss and creates no grant", async () => {
    const user = await createAuthedUser(app);
    const before = await prisma.oAuthGrant.count({ where: { userId: user.user.id } });
    const res = await decide(user, await consentReq(pkce().challenge), { approve: false });
    const url = new URL(res.body.redirectUrl);
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe("xyz");
    expect(url.searchParams.get("iss")).toBe(issuer);
    expect(await prisma.oAuthGrant.count({ where: { userId: user.user.id } })).toBe(before);
  });

  it("rejects bad authorize requests", async () => {
    const { challenge } = pkce();
    const missingResource = await authorize(challenge, { resource: undefined });
    expect(new URL(missingResource.headers.location!).searchParams.get("error")).toBe("invalid_target");
    const wrongResource = await authorize(challenge, { resource: "https://other.example/mcp" });
    expect(new URL(wrongResource.headers.location!).searchParams.get("error")).toBe("invalid_target");
    const plain = await authorize(challenge, { code_challenge_method: "plain" });
    expect(new URL(plain.headers.location!).searchParams.get("error")).toBe("invalid_request");
    const badRedirect = await authorize(challenge, { redirect_uri: "https://evil.example/cb" });
    expect(badRedirect.status).toBe(400);
    expect((await authorize(challenge, { client_id: "https://nope.example/c.json" })).status).toBe(400);
  });

  it("accepts a loopback redirect on any port and delivers the code to that exact URI", async () => {
    const user = await createAuthedUser(app);
    const { verifier, challenge } = pkce();
    const loopback = "http://localhost:53124/callback";
    const res = await authorize(challenge, { redirect_uri: loopback });
    const req = new URL(res.headers.location!).searchParams.get("req")!;
    const decision = await decide(user, req);
    expect(decision.body.redirectUrl.startsWith(`${loopback}?`)).toBe(true);
    const code = new URL(decision.body.redirectUrl).searchParams.get("code")!;
    const ok = await token({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: loopback, resource });
    expect(ok.status).toBe(200);
  });

  it("rejects tampered or foreign consent requests and non-session credentials", async () => {
    const user = await createAuthedUser(app);
    const req = await consentReq(pkce().challenge);
    expect((await decide(user, `${req}x`)).status).toBe(400);
    expect((await decide(user, "garbage")).status).toBe(400);
    expect(
      (await request(app).post("/oauth/authorize/decision").set("Authorization", `Bearer flo_abc`).send({ req, approve: true })).status
    ).toBe(401);
    const ctx = await request(app).get("/oauth/authorize/context").query({ req }).set("Authorization", `Bearer ${user.token}`);
    expect(ctx.body).toEqual({
      client: { name: "Test App", redirectHost: "app.example" },
      scopes: { requested: ["read", "write"] },
      user: { email: user.user.email }
    });
  });

  it("rejects a wrong verifier, redirect or resource, and an expired code", async () => {
    const user = await createAuthedUser(app);
    const { verifier, challenge } = pkce();
    const good = { grant_type: "authorization_code", code_verifier: verifier, redirect_uri: REDIRECT, resource };

    const code1 = await getCode(user, challenge);
    expect((await token({ ...good, code: code1, code_verifier: pkce().verifier })).body.error).toBe("invalid_grant");
    const code2 = await getCode(user, challenge);
    expect((await token({ ...good, code: code2, redirect_uri: "http://localhost/callback" })).body.error).toBe("invalid_grant");
    const code3 = await getCode(user, challenge);
    expect((await token({ ...good, code: code3, resource: "https://other.example/mcp" })).body.error).toBe("invalid_target");
    expect((await token({ ...good, code: code3, resource: undefined })).body.error).toBe("invalid_target");

    const code4 = await getCode(user, challenge);
    await prisma.oAuthGrant.updateMany({ where: { userId: user.user.id }, data: { codeExpiresAt: new Date(Date.now() - 1000) } });
    expect((await token({ ...good, code: code4 })).body.error).toBe("invalid_grant");
  });

  it("revokes the grant when a used code is replayed, and lets only one concurrent exchange win", async () => {
    const user = await createAuthedUser(app);
    const { verifier, challenge } = pkce();
    const good = { grant_type: "authorization_code", code_verifier: verifier, redirect_uri: REDIRECT, resource };

    const code = await getCode(user, challenge);
    const first = await token({ ...good, code });
    expect((await mcp(first.body.access_token)).status).toBe(200);
    expect((await token({ ...good, code })).body.error).toBe("invalid_grant");
    expect((await mcp(first.body.access_token)).status).toBe(401);

    const raced = await getCode(user, challenge);
    const results = await Promise.all([token({ ...good, code: raced }), token({ ...good, code: raced })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it("rotates refresh tokens, tolerates a retry within 30 s and revokes on late reuse", async () => {
    const user = await createAuthedUser(app);
    const first = await connect(user);

    const second = (await refresh(first.refresh_token)).body;
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect((await mcp(first.access_token)).status).toBe(401);
    expect((await mcp(second.access_token)).status).toBe(200);

    const retry = await refresh(first.refresh_token);
    expect(retry.status).toBe(200);
    expect((await mcp(retry.body.access_token)).status).toBe(200);
    expect((await mcp(second.access_token)).status).toBe(401);

    // the racer holding the other pair converges through the grace rule, never revoking
    const converged = await refresh(second.refresh_token);
    expect(converged.status).toBe(200);

    await prisma.oAuthGrant.updateMany({ where: { userId: user.user.id }, data: { rotatedAt: new Date(Date.now() - 120_000) } });
    const late = await refresh(retry.body.refresh_token);
    expect(late.body.error).toBe("invalid_grant");
    expect((await mcp(converged.body.access_token)).status).toBe(401);
    expect((await refresh(converged.body.refresh_token)).status).toBe(400);
  });

  it("issues exactly one pair when the same refresh token races", async () => {
    const user = await createAuthedUser(app);
    const { refresh_token } = await connect(user);
    const results = await Promise.all([refresh(refresh_token), refresh(refresh_token)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await prisma.oAuthGrant.count({ where: { userId: user.user.id, revokedAt: null } })).toBe(1);
  });

  it("rejects scope widening and another client's refresh token", async () => {
    const user = await createAuthedUser(app);
    const { refresh_token } = await connect(user);
    expect((await refresh(refresh_token, { scope: "read write" })).body.error).toBe("invalid_scope");
    const other = await request(app).post("/token").type("form").send({ client_id: "https://nope.example/c.json", grant_type: "refresh_token", refresh_token, resource });
    expect(other.status).toBe(400);
  });

  it("caps the access token at the grant expiry and never extends the grant", async () => {
    const user = await createAuthedUser(app);
    const { refresh_token } = await connect(user, { lifetime: "1d" });
    const soon = new Date(Date.now() + 10 * 60_000);
    await prisma.oAuthGrant.updateMany({ where: { userId: user.user.id }, data: { expiresAt: soon } });

    const res = await refresh(refresh_token);
    expect(res.body.expires_in).toBeLessThanOrEqual(600);
    expect((await prisma.oAuthGrant.findFirst({ where: { userId: user.user.id } }))!.expiresAt).toEqual(soon);

    await prisma.oAuthGrant.updateMany({ where: { userId: user.user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await refresh(res.body.refresh_token)).body.error).toBe("invalid_grant");
    expect((await mcp(res.body.access_token)).status).toBe(401);
  });

  it("keeps rotating a Never grant with one-hour access tokens", async () => {
    const user = await createAuthedUser(app);
    let current = await connect(user, { lifetime: "never" });
    for (let i = 0; i < 2; i++) {
      const next = (await refresh(current.refresh_token)).body;
      expect(next.expires_in).toBeGreaterThan(3500);
      current = next;
    }
    expect((await prisma.oAuthGrant.findFirst({ where: { userId: user.user.id } }))!.expiresAt).toBeNull();
    expect((await mcp(current.access_token)).status).toBe(200);
  });

  it("lists only completed grants and revokes via the UI endpoint with user isolation", async () => {
    const user = await createAuthedUser(app);
    const other = await createAuthedUser(app);
    await consentReq(pkce().challenge);
    await decide(user, await consentReq(pkce().challenge)); // unfinished: code never exchanged
    const tokens = await connect(user);

    const list = await request(app).get("/users/me/oauth-grants").set("Authorization", `Bearer ${user.token}`);
    expect(list.body.grants).toHaveLength(1);
    expect(list.body.grants[0]).toMatchObject({ clientId: CID, clientName: "Test App", redirectHost: "app.example", scopes: ["read"] });
    expect(JSON.stringify(list.body)).not.toMatch(/Hash|flo_|flr_/);

    const id = list.body.grants[0].id;
    expect((await request(app).delete(`/users/me/oauth-grants/${id}`).set("Authorization", `Bearer ${other.token}`)).status).toBe(404);
    expect((await mcp(tokens.access_token)).status).toBe(200);

    expect((await request(app).delete(`/users/me/oauth-grants/${id}`).set("Authorization", `Bearer ${user.token}`)).status).toBe(204);
    expect((await mcp(tokens.access_token)).status).toBe(401);
    expect((await refresh(tokens.refresh_token)).status).toBe(400);
    expect((await request(app).get("/users/me/oauth-grants").set("Authorization", `Bearer ${user.token}`)).body.grants).toEqual([]);
  });

  it("revokes through /revoke for the owning client only and answers 200 for unknown tokens", async () => {
    const user = await createAuthedUser(app);
    const tokens = await connect(user);

    const foreign = await request(app).post("/revoke").type("form").send({ client_id: "https://nope.example/c.json", token: tokens.refresh_token });
    expect(foreign.status).toBe(400);
    expect((await mcp(tokens.access_token)).status).toBe(200);

    expect((await request(app).post("/revoke").type("form").send({ client_id: CID, token: "flr_unknown" })).status).toBe(200);
    expect((await request(app).post("/revoke").type("form").send({ client_id: CID, token: tokens.refresh_token })).status).toBe(200);
    expect((await mcp(tokens.access_token)).status).toBe(401);
  });

  it("stops authenticating when the user is deleted", async () => {
    const user = await createAuthedUser(app);
    const tokens = await connect(user);
    await prisma.user.delete({ where: { id: user.user.id } });
    expect((await mcp(tokens.access_token)).status).toBe(401);
  });
});
