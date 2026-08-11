import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../../config/env.js";
import {
  buildRefreshTokenCookie,
  clearRefreshTokenCookie,
  parseCookies,
  readRefreshTokenCookie,
  refreshTokenCookieName
} from "../refreshTokenCookie.js";

vi.mock("../../../../config/env.js", () => ({
  env: { NODE_ENV: "development", REFRESH_TOKEN_COOKIE_DOMAIN: undefined }
}));

describe("parseCookies", () => {
  it("parses a header with multiple cookies", () => {
    const cookies = parseCookies("a=1; b=2");
    expect(cookies.get("a")).toBe("1");
    expect(cookies.get("b")).toBe("2");
  });

  it("URI-decodes values", () => {
    expect(parseCookies("token=a%20b").get("token")).toBe("a b");
  });

  it("returns an empty map for undefined", () => {
    expect(parseCookies(undefined).size).toBe(0);
  });

  it("skips malformed parts without an '='", () => {
    expect(parseCookies("garbage; a=1").get("a")).toBe("1");
  });
});

describe("readRefreshTokenCookie", () => {
  it("reads the refresh token cookie value", () => {
    expect(
      readRefreshTokenCookie(`${refreshTokenCookieName}=abc123`)
    ).toBe("abc123");
  });

  it("returns undefined when the cookie is absent", () => {
    expect(readRefreshTokenCookie("other=1")).toBeUndefined();
  });
});

describe("buildRefreshTokenCookie", () => {
  beforeEach(() => {
    Object.assign(env, { NODE_ENV: "development", REFRESH_TOKEN_COOKIE_DOMAIN: undefined });
  });

  it("builds an HttpOnly, SameSite=Strict, /auth-scoped cookie", () => {
    const cookie = buildRefreshTokenCookie(
      "token-value",
      new Date(Date.now() + 60_000)
    );

    expect(cookie).toContain(`${refreshTokenCookieName}=token-value`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/auth");
  });

  it("derives Max-Age from expiresAt, floored at 0 for a past expiry", () => {
    const cookie = buildRefreshTokenCookie(
      "token-value",
      new Date(Date.now() - 60_000)
    );
    expect(cookie).toContain("Max-Age=0");
  });

  it("omits Domain/Secure outside production with no configured domain", () => {
    const cookie = buildRefreshTokenCookie("t", new Date(Date.now() + 1000));
    expect(cookie).not.toContain("Domain=");
    expect(cookie).not.toContain("Secure");
  });

  it("adds Domain when REFRESH_TOKEN_COOKIE_DOMAIN is configured", () => {
    Object.assign(env, { REFRESH_TOKEN_COOKIE_DOMAIN: ".example.com" });
    const cookie = buildRefreshTokenCookie("t", new Date(Date.now() + 1000));
    expect(cookie).toContain("Domain=.example.com");
  });

  it("adds Secure in production", () => {
    Object.assign(env, { NODE_ENV: "production" });
    const cookie = buildRefreshTokenCookie("t", new Date(Date.now() + 1000));
    expect(cookie).toContain("Secure");
  });
});

describe("clearRefreshTokenCookie", () => {
  beforeEach(() => {
    Object.assign(env, { NODE_ENV: "development", REFRESH_TOKEN_COOKIE_DOMAIN: undefined });
  });

  it("clears the cookie with Max-Age=0", () => {
    const cookie = clearRefreshTokenCookie();
    expect(cookie).toContain(`${refreshTokenCookieName}=;`);
    expect(cookie).toContain("Max-Age=0");
  });

  it("adds Domain/Secure the same way buildRefreshTokenCookie does", () => {
    Object.assign(env, { NODE_ENV: "production", REFRESH_TOKEN_COOKIE_DOMAIN: ".example.com" });
    const cookie = clearRefreshTokenCookie();
    expect(cookie).toContain("Domain=.example.com");
    expect(cookie).toContain("Secure");
  });
});
