import type { Express } from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../config/env.js";
import {
  findSetCookie,
  loginSession,
  refreshCookieFrom,
  refreshWith,
  registerWithSession
} from "../../../tests/helpers/sessionCookies.js";
import {
  startTestDatabase,
  stopTestDatabase
} from "../../../tests/helpers/testDatabase.js";
import {
  refreshTokenCookieName,
  sessionPresenceCookieName
} from "../utils/refreshTokenCookie.js";
import { signGoogleState } from "../providers/google/utils/googleState.js";
import { hashRefreshToken } from "../utils/tokens.js";

// NOT run in this sandbox (no Docker) — see docs/TESTING.md.
let app: Express;
let prisma: typeof import("../../../db/prisma.js").prisma;

const cookieValue = (cookie: string) => cookie.split("=")[1] ?? "";

function hasMaxAge(response: { headers: Record<string, unknown> }, name: string) {
  return /Max-Age=\d+/.test(findSetCookie(response, name) ?? "");
}

describe("/auth routes", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../../app.js"));
    ({ prisma } = await import("../../../db/prisma.js"));
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  it("registers a new user, setting both session cookies and returning a token", async () => {
    const response = await request(app).post("/auth/register").send({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "longenough"
    });

    expect(response.status).toBe(201);
    expect(response.body.token).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({ email: "ada@example.com" });
    expect(response.body.user).not.toHaveProperty("passwordHash");
    expect(findSetCookie(response, refreshTokenCookieName)).toBeDefined();
    expect(findSetCookie(response, sessionPresenceCookieName)).toBeDefined();
  });

  it("rejects a duplicate registration email with a 409", async () => {
    await request(app).post("/auth/register").send({
      name: "Dup",
      email: "dup@example.com",
      password: "longenough"
    });

    const response = await request(app).post("/auth/register").send({
      name: "Dup Again",
      email: "dup@example.com",
      password: "longenough"
    });

    expect(response.status).toBe(409);
  });

  it("rejects an invalid password with a 401", async () => {
    const { email } = await registerWithSession(app, "correctpassword");

    const response = await request(app)
      .post("/auth/login")
      .send({ email, password: "incorrect" });

    expect(response.status).toBe(401);
  });

  it("requires authentication for GET /auth/me", async () => {
    const response = await request(app).get("/auth/me");
    expect(response.status).toBe(401);
  });

  it("returns the caller's profile for GET /auth/me with a valid token", async () => {
    const { token, email } = await registerWithSession(app);

    const response = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ email });
  });

  describe("login session mode", () => {
    it("defaults to a persistent session with Max-Age on both cookies", async () => {
      const { email, password } = await registerWithSession(app);

      const { response, cookie } = await loginSession(app, email, password);

      expect(response.status).toBe(200);
      expect(hasMaxAge(response, refreshTokenCookieName)).toBe(true);
      expect(hasMaxAge(response, sessionPresenceCookieName)).toBe(true);
      const row = await prisma.refreshToken.findUnique({
        where: { tokenHash: hashRefreshToken(decodeURIComponent(cookieValue(cookie))) }
      });
      expect(row?.persistent).toBe(true);
    });

    it("keepLoggedIn=false sets session cookies without Max-Age and stores persistent=false", async () => {
      const { email, password } = await registerWithSession(app);

      const { response, cookie } = await loginSession(app, email, password, false);

      expect(response.status).toBe(200);
      expect(hasMaxAge(response, refreshTokenCookieName)).toBe(false);
      expect(hasMaxAge(response, sessionPresenceCookieName)).toBe(false);
      const row = await prisma.refreshToken.findUnique({
        where: { tokenHash: hashRefreshToken(decodeURIComponent(cookieValue(cookie))) }
      });
      expect(row?.persistent).toBe(false);
    });

    it("keeps a non-persistent session non-persistent across refresh", async () => {
      const { email, password } = await registerWithSession(app);
      const { cookie } = await loginSession(app, email, password, false);

      const refreshed = await refreshWith(app, cookie);

      expect(refreshed.status).toBe(200);
      expect(hasMaxAge(refreshed, refreshTokenCookieName)).toBe(false);
      expect(hasMaxAge(refreshed, sessionPresenceCookieName)).toBe(false);
      const row = await prisma.refreshToken.findUnique({
        where: {
          tokenHash: hashRefreshToken(decodeURIComponent(cookieValue(refreshCookieFrom(refreshed))))
        }
      });
      expect(row?.persistent).toBe(false);
    });
  });

  describe("refresh rotation", () => {
    it("sets both cookies on refresh", async () => {
      const { cookie } = await registerWithSession(app);

      const refreshed = await refreshWith(app, cookie);

      expect(refreshed.status).toBe(200);
      expect(findSetCookie(refreshed, refreshTokenCookieName)).toBeDefined();
      expect(findSetCookie(refreshed, sessionPresenceCookieName)).toBeDefined();
    });

    it("tolerates a lost response: the presented cookie can be replayed", async () => {
      const { cookie: c0 } = await registerWithSession(app);

      expect((await refreshWith(app, c0)).status).toBe(200);
      expect((await refreshWith(app, c0)).status).toBe(200);
    });

    it("rejects the original cookie once its successor has been used", async () => {
      const { cookie: c0 } = await registerWithSession(app);
      const first = await refreshWith(app, c0);
      const c1 = refreshCookieFrom(first);

      expect((await refreshWith(app, c1)).status).toBe(200);
      expect((await refreshWith(app, c0)).status).toBe(401);
    });

    it("serves 5 concurrent refreshes with one cookie", async () => {
      const { cookie } = await registerWithSession(app);

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => refreshWith(app, cookie))
      );

      expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    });

    it("rejects a refresh with no cookie", async () => {
      const response = await request(app).post("/auth/refresh");
      expect(response.status).toBe(401);
    });
  });

  describe("logout", () => {
    it("clears both cookies, even without one present", async () => {
      const response = await request(app).post("/auth/logout");

      expect(response.status).toBe(204);
      expect(findSetCookie(response, refreshTokenCookieName)).toContain("Max-Age=0");
      expect(findSetCookie(response, sessionPresenceCookieName)).toContain("Max-Age=0");
    });

    it("revokes the current token and its predecessor but not another session of the same user", async () => {
      const { email, password, cookie: c0 } = await registerWithSession(app);
      const c1 = refreshCookieFrom(await refreshWith(app, c0));
      const other = await loginSession(app, email, password);

      const logout = await request(app).post("/auth/logout").set("Cookie", c1);

      expect(logout.status).toBe(204);
      expect((await refreshWith(app, c1)).status).toBe(401);
      expect((await refreshWith(app, c0)).status).toBe(401);
      expect((await refreshWith(app, other.cookie)).status).toBe(200);
    });

    it("revokes a token issued from the presented token by a refresh in flight", async () => {
      const { cookie: c0 } = await registerWithSession(app);
      const c1 = refreshCookieFrom(await refreshWith(app, c0));

      await request(app).post("/auth/logout").set("Cookie", c0);

      expect((await refreshWith(app, c1)).status).toBe(401);
    });

    it("leaves another user's session refreshable", async () => {
      const a = await registerWithSession(app);
      const b = await registerWithSession(app);

      await request(app).post("/auth/logout").set("Cookie", a.cookie);

      expect((await refreshWith(app, a.cookie)).status).toBe(401);
      expect((await refreshWith(app, b.cookie)).status).toBe(200);
    });
  });

  describe("PATCH /auth/password", () => {
    const body = (currentPassword: string) => ({
      currentPassword,
      newPassword: "brandNewPassword",
      confirmPassword: "brandNewPassword"
    });

    it("returns 400 for a wrong current password and leaves other sessions alive", async () => {
      const a = await registerWithSession(app);
      const other = await loginSession(app, a.email, a.password);

      const response = await request(app)
        .patch("/auth/password")
        .set("Authorization", `Bearer ${a.token}`)
        .set("Cookie", a.cookie)
        .send(body("wrong"));

      expect(response.status).toBe(400);
      expect((await refreshWith(app, other.cookie)).status).toBe(200);
      expect((await refreshWith(app, a.cookie)).status).toBe(200);
    });

    it("returns 204, revokes other sessions, and keeps the current one", async () => {
      const a = await registerWithSession(app);
      const other = await loginSession(app, a.email, a.password);

      const response = await request(app)
        .patch("/auth/password")
        .set("Authorization", `Bearer ${a.token}`)
        .set("Cookie", a.cookie)
        .send(body(a.password));

      expect(response.status).toBe(204);
      expect((await refreshWith(app, other.cookie)).status).toBe(401);
      expect((await refreshWith(app, a.cookie)).status).toBe(200);
    });

    it("does not affect another user's session", async () => {
      const a = await registerWithSession(app);
      const b = await registerWithSession(app);

      const response = await request(app)
        .patch("/auth/password")
        .set("Authorization", `Bearer ${a.token}`)
        .set("Cookie", a.cookie)
        .send(body(a.password));

      expect(response.status).toBe(204);
      expect((await refreshWith(app, b.cookie)).status).toBe(200);
    });

    it("returns 401 without an access token", async () => {
      const a = await registerWithSession(app);

      const response = await request(app)
        .patch("/auth/password")
        .set("Cookie", a.cookie)
        .send(body(a.password));

      expect(response.status).toBe(401);
    });

    it("returns 401 with an expired access token", async () => {
      const a = await registerWithSession(app);
      const expired = jwt.sign({ email: a.email }, env.JWT_SECRET, {
        subject: a.userId,
        audience: "flowledger-access",
        expiresIn: -60
      });

      const response = await request(app)
        .patch("/auth/password")
        .set("Authorization", `Bearer ${expired}`)
        .set("Cookie", a.cookie)
        .send(body(a.password));

      expect(response.status).toBe(401);
    });
  });

  describe("rejected refresh", () => {
    it.each([
      ["no cookie", undefined],
      ["an unknown token", `${refreshTokenCookieName}=not-a-real-token`]
    ])("expires only the presence cookie with %s", async (_label, cookie) => {
      const call = request(app).post("/auth/refresh");
      const response = await (cookie ? call.set("Cookie", cookie) : call);

      expect(response.status).toBe(401);
      expect(findSetCookie(response, sessionPresenceCookieName)).toContain("Max-Age=0");
      expect(findSetCookie(response, refreshTokenCookieName)).toBeUndefined();
    });
  });

  describe("tokens issued for other purposes", () => {
    it.each(["/notifications", "/transactions"])(
      "returns 401 and no records from GET %s for a Google state token",
      async (path) => {
        const stateToken = signGoogleState({ nonce: "n", redirect: "/", keepLoggedIn: true });

        const response = await request(app)
          .get(path)
          .set("Authorization", `Bearer ${stateToken}`);

        expect(response.status).toBe(401);
        expect(response.body).not.toHaveProperty("data");
      }
    );

    it("returns 401 from GET /transactions for a consent-audience token", async () => {
      const consentToken = jwt.sign({ cid: "x" }, env.JWT_SECRET, {
        audience: "oauth-consent",
        expiresIn: "10m"
      });

      const response = await request(app)
        .get("/transactions")
        .set("Authorization", `Bearer ${consentToken}`);

      expect(response.status).toBe(401);
    });
  });
});
