import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  findSetCookie,
  loginSession,
  refreshCookieFrom,
  refreshWith,
  registerWithSession
} from "../helpers/sessionCookies.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";
import { refreshTokenCookieName } from "../../modules/auth/utils/refreshTokenCookie.js";
import { signGoogleState } from "../../modules/auth/providers/google/utils/googleState.js";
import { googleStateCookieName } from "../../modules/auth/providers/google/utils/googleStateCookie.js";
import { hashRefreshToken } from "../../modules/auth/utils/tokens.js";

vi.mock("../../modules/auth/providers/google/services/google.client.js", () => ({
  exchangeGoogleCode: vi.fn(async (code: string) => ({ id_token: code, access_token: code })),
  verifyGoogleIdentity: vi.fn(async (idToken: string) => JSON.parse(idToken))
}));

let app: Express;
let prisma: typeof import("../../db/prisma.js").prisma;

function googleCallback(
  profile: { providerAccountId: string; email: string; name: string },
  linkUserId?: string
) {
  const nonce = "integration-nonce";
  const state = signGoogleState({
    nonce,
    redirect: "/",
    keepLoggedIn: true,
    ...(linkUserId ? { linkUserId } : {})
  });

  return request(app)
    .get("/auth/google/callback")
    .query({ state, code: JSON.stringify(profile) })
    .set("Cookie", `${googleStateCookieName}=${nonce}`);
}

const uniqueId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("account identity and session hardening", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
    ({ prisma } = await import("../../db/prisma.js"));
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  describe("Google identity", () => {
    it("refuses an unlinked account's email in any letter case, with no link or session", async () => {
      const owner = await registerWithSession(app);

      const response = await googleCallback({
        providerAccountId: `sub-${uniqueId()}`,
        email: owner.email.toUpperCase(),
        name: "Attacker"
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain("/login?oauthError=");
      expect(findSetCookie(response, refreshTokenCookieName)).toBeUndefined();
      expect(await prisma.userAuthAccount.count({ where: { userId: owner.userId } })).toBe(0);
    });

    it("creates a new account for a new email and returns to it through the link", async () => {
      const profile = {
        providerAccountId: `sub-${uniqueId()}`,
        email: `google-${uniqueId()}@example.com`,
        name: "Google User"
      };

      const first = await googleCallback(profile);
      expect(findSetCookie(first, refreshTokenCookieName)).toBeDefined();

      const user = await prisma.user.findUniqueOrThrow({ where: { email: profile.email } });
      await prisma.user.update({
        where: { id: user.id },
        data: { email: `changed-${uniqueId()}@example.com` }
      });

      const second = await googleCallback(profile);
      expect(findSetCookie(second, refreshTokenCookieName)).toBeDefined();
      expect(await prisma.user.count({ where: { email: profile.email } })).toBe(0);
    });

    it("links from a signed-in flow with no session change, then allows Google sign-in", async () => {
      const owner = await registerWithSession(app);
      const profile = {
        providerAccountId: `sub-${uniqueId()}`,
        email: `different-${uniqueId()}@example.com`,
        name: "Owner"
      };

      const link = await googleCallback(profile, owner.userId);

      expect(link.headers.location).toContain("/profile?tab=security&googleLink=connected");
      expect(findSetCookie(link, refreshTokenCookieName)).toBeUndefined();

      const status = await request(app)
        .get("/auth/google/link")
        .set("Authorization", `Bearer ${owner.token}`);
      expect(status.body).toEqual({ connected: true });

      const signIn = await googleCallback(profile);
      expect(findSetCookie(signIn, refreshTokenCookieName)).toBeDefined();
    });

    it("refuses an identity linked to another account, naming no one", async () => {
      const first = await registerWithSession(app);
      const second = await registerWithSession(app);
      const profile = {
        providerAccountId: `sub-${uniqueId()}`,
        email: `shared-${uniqueId()}@example.com`,
        name: "Shared"
      };
      await googleCallback(profile, first.userId);

      const conflict = await googleCallback(profile, second.userId);

      expect(conflict.headers.location).toContain("googleLink=conflict");
      expect(conflict.headers.location).not.toContain(first.email);
      expect(await prisma.userAuthAccount.count({ where: { userId: second.userId } })).toBe(0);
    });

    it("rejects the link start without an access token", async () => {
      expect((await request(app).post("/auth/google/link")).status).toBe(401);
      expect((await request(app).get("/auth/google/link")).status).toBe(401);
    });

    it("returns Google's URL and the state cookie from an authenticated link start", async () => {
      const owner = await registerWithSession(app);

      const response = await request(app)
        .post("/auth/google/link")
        .set("Authorization", `Bearer ${owner.token}`);

      expect(response.status).toBe(200);
      expect(response.body.url).toContain("accounts.google.com");
      expect(findSetCookie(response, googleStateCookieName)).toContain(
        "Path=/auth/google/callback"
      );
    });
  });

  describe("email change", () => {
    it("changes the email, keeps this device, signs out others and returns a usable token", async () => {
      const owner = await registerWithSession(app);
      const other = await loginSession(app, owner.email, owner.password);
      const email = `moved-${uniqueId()}@example.com`;

      const response = await request(app)
        .patch("/auth/email")
        .set("Authorization", `Bearer ${owner.token}`)
        .set("Cookie", owner.cookie)
        .send({ email, currentPassword: owner.password });

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe(email);
      expect(response.body.user).not.toHaveProperty("passwordHash");

      const me = await request(app)
        .get("/auth/me")
        .set("Authorization", `Bearer ${response.body.token}`);
      expect(me.body.user.email).toBe(email);

      expect((await refreshWith(app, other.cookie)).status).toBe(401);
      expect((await refreshWith(app, owner.cookie)).status).toBe(200);
    });

    it("leaves everything unchanged on a wrong password", async () => {
      const owner = await registerWithSession(app);

      const response = await request(app)
        .patch("/auth/email")
        .set("Authorization", `Bearer ${owner.token}`)
        .set("Cookie", owner.cookie)
        .send({ email: `no-${uniqueId()}@example.com`, currentPassword: "wrong-password" });

      expect(response.status).toBe(400);
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: owner.userId } });
      expect(stored.email).toBe(owner.email);
      expect((await refreshWith(app, owner.cookie)).status).toBe(200);
    });

    it("returns 409 for an address registered in another letter case", async () => {
      const owner = await registerWithSession(app);
      const other = await registerWithSession(app);

      const response = await request(app)
        .patch("/auth/email")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ email: other.email.toUpperCase(), currentPassword: owner.password });

      expect(response.status).toBe(409);
    });

    it("refuses a different email through the general profile update", async () => {
      const owner = await registerWithSession(app);

      const response = await request(app)
        .patch("/users/me")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ name: "New Name", email: `sneaky-${uniqueId()}@example.com` });

      expect(response.status).toBe(400);
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: owner.userId } });
      expect(stored.email).toBe(owner.email);
      expect(stored.name).toBe("Session User");
    });
  });

  describe("refresh replay", () => {
    function tokenFrom(cookie: string) {
      return decodeURIComponent(cookie.split("=")[1] ?? "");
    }

    async function rotateChain() {
      const owner = await registerWithSession(app);
      const second = await refreshWith(app, owner.cookie);
      const third = await refreshWith(app, refreshCookieFrom(second));
      return { owner, original: owner.cookie, latest: refreshCookieFrom(third) };
    }

    it("leaves descendants valid when a token revoked inside the grace period is replayed", async () => {
      const { original, latest } = await rotateChain();

      expect((await refreshWith(app, original)).status).toBe(401);
      expect((await refreshWith(app, latest)).status).toBe(200);
    });

    it("revokes descendants after the grace period, and spares the user's other device", async () => {
      const { owner, original, latest } = await rotateChain();
      const otherDevice = await loginSession(app, owner.email, owner.password);
      await prisma.refreshToken.update({
        where: { tokenHash: hashRefreshToken(tokenFrom(original)) },
        data: { revokedAt: new Date(Date.now() - 120_000) }
      });

      expect((await refreshWith(app, original)).status).toBe(401);
      expect((await refreshWith(app, latest)).status).toBe(401);
      expect((await refreshWith(app, otherDevice.cookie)).status).toBe(200);
    });

    it("removes the user's expired rows on issue and keeps revoked unexpired ones", async () => {
      const { owner, original } = await rotateChain();
      const expired = await prisma.refreshToken.create({
        data: {
          userId: owner.userId,
          tokenHash: `expired-${uniqueId()}`,
          expiresAt: new Date(Date.now() - 1000)
        }
      });

      await loginSession(app, owner.email, owner.password);

      expect(await prisma.refreshToken.findUnique({ where: { id: expired.id } })).toBeNull();
      expect(
        await prisma.refreshToken.findUnique({
          where: { tokenHash: hashRefreshToken(tokenFrom(original)) }
        })
      ).not.toBeNull();
    });
  });

  describe("foreign origins", () => {
    it("rejects refresh and logout from a sibling origin without touching the token", async () => {
      const owner = await registerWithSession(app);
      const hash = hashRefreshToken(decodeURIComponent(owner.cookie.split("=")[1] ?? ""));

      for (const path of ["/auth/refresh", "/auth/logout"]) {
        const response = await request(app)
          .post(path)
          .set("Origin", "https://n8n.razs.example")
          .set("Cookie", owner.cookie);
        expect(response.status).toBe(403);
      }

      const stored = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: hash } });
      expect(stored.revokedAt).toBeNull();
      expect((await refreshWith(app, owner.cookie)).status).toBe(200);
    });
  });
});
