import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../../config/env.js";
import {
  buildSessionCookies,
  clearSessionCookies,
  parseCookies,
  readRefreshTokenCookie,
  refreshTokenCookieName,
  sessionPresenceCookieName
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

const future = () => new Date(Date.now() + 60_000);

describe("buildSessionCookies", () => {
  beforeEach(() => {
    Object.assign(env, { NODE_ENV: "development", REFRESH_TOKEN_COOKIE_DOMAIN: undefined });
  });

  it("returns the refresh cookie (HttpOnly, SameSite=Strict, /auth) and the presence cookie", () => {
    const cookies = buildSessionCookies({ token: "token-value", expiresAt: future(), persistent: true });

    expect(cookies).toHaveLength(2);
    const [refresh, presence] = cookies;
    expect(refresh).toContain(`${refreshTokenCookieName}=token-value`);
    expect(refresh).toContain("HttpOnly");
    expect(refresh).toContain("SameSite=Strict");
    expect(refresh).toContain("Path=/auth");
    expect(presence).toContain(`${sessionPresenceCookieName}=1`);
    expect(presence).toContain("SameSite=Lax");
    expect(presence).toContain("Path=/");
    expect(presence).not.toContain("Path=/auth");
  });

  it("puts no token material in the presence cookie", () => {
    const [, presence] = buildSessionCookies({ token: "secret-token-value", expiresAt: future(), persistent: true });

    expect(presence).not.toContain("secret-token-value");
    expect(presence?.startsWith(`${sessionPresenceCookieName}=1;`)).toBe(true);
  });

  it("sets Max-Age on both cookies when persistent", () => {
    const cookies = buildSessionCookies({ token: "t", expiresAt: future(), persistent: true });

    for (const cookie of cookies) {
      expect(cookie).toMatch(/Max-Age=(59|60)(;|$)/);
    }
  });

  it("floors Max-Age at 0 for a past expiry", () => {
    const [refresh] = buildSessionCookies({
      token: "t",
      expiresAt: new Date(Date.now() - 60_000),
      persistent: true
    });
    expect(refresh).toContain("Max-Age=0");
  });

  it("omits Max-Age on both cookies when not persistent", () => {
    const cookies = buildSessionCookies({ token: "t", expiresAt: future(), persistent: false });

    expect(cookies).toHaveLength(2);
    for (const cookie of cookies) {
      expect(cookie).not.toContain("Max-Age");
    }
  });

  it("omits Domain/Secure outside production with no configured domain", () => {
    for (const cookie of buildSessionCookies({ token: "t", expiresAt: future(), persistent: true })) {
      expect(cookie).not.toContain("Domain=");
      expect(cookie).not.toContain("Secure");
    }
  });

  it("keeps the refresh cookie host-only, scopes presence to the domain, and expires the old domain copy", () => {
    Object.assign(env, { REFRESH_TOKEN_COOKIE_DOMAIN: ".example.com" });
    const cookies = buildSessionCookies({ token: "t", expiresAt: future(), persistent: true });

    expect(cookies).toHaveLength(3);
    const [refresh, presence, clearOld] = cookies;
    expect(refresh).toContain(`${refreshTokenCookieName}=t`);
    expect(refresh).not.toContain("Domain=");
    expect(presence).toContain("Domain=.example.com");
    expect(clearOld).toContain(`${refreshTokenCookieName}=;`);
    expect(clearOld).toContain("Path=/auth");
    expect(clearOld).toContain("Max-Age=0");
    expect(clearOld).toContain("Domain=.example.com");
  });

  it("keeps the same attributes for browser-session cookies, with no Max-Age on the live ones", () => {
    Object.assign(env, { REFRESH_TOKEN_COOKIE_DOMAIN: ".example.com" });
    const [refresh, presence] = buildSessionCookies({ token: "t", expiresAt: future(), persistent: false });

    expect(refresh).not.toContain("Domain=");
    expect(refresh).not.toContain("Max-Age");
    expect(presence).toContain("Domain=.example.com");
    expect(presence).not.toContain("Max-Age");
  });

  it("adds Secure to both cookies in production", () => {
    Object.assign(env, { NODE_ENV: "production" });
    for (const cookie of buildSessionCookies({ token: "t", expiresAt: future(), persistent: true })) {
      expect(cookie).toContain("Secure");
    }
  });
});

describe("clearSessionCookies", () => {
  beforeEach(() => {
    Object.assign(env, { NODE_ENV: "development", REFRESH_TOKEN_COOKIE_DOMAIN: undefined });
  });

  it("clears both cookies with Max-Age=0", () => {
    const [refresh, presence] = clearSessionCookies();

    expect(refresh).toContain(`${refreshTokenCookieName}=;`);
    expect(refresh).toContain("Path=/auth");
    expect(refresh).toContain("Max-Age=0");
    expect(presence).toContain(`${sessionPresenceCookieName}=;`);
    expect(presence).toContain("Path=/");
    expect(presence).toContain("Max-Age=0");
  });

  it("clears the host-only refresh cookie, the presence cookie and the old domain copy", () => {
    Object.assign(env, { NODE_ENV: "production", REFRESH_TOKEN_COOKIE_DOMAIN: ".example.com" });
    const [refresh, presence, clearOld] = clearSessionCookies();

    expect(refresh).not.toContain("Domain=");
    expect(presence).toContain("Domain=.example.com");
    expect(clearOld).toContain("Domain=.example.com");
    for (const cookie of [refresh, presence, clearOld]) {
      expect(cookie).toContain("Max-Age=0");
      expect(cookie).toContain("Secure");
    }
  });
});

describe("cookie names", () => {
  async function namesFor(nodeEnv: string) {
    vi.resetModules();
    vi.doMock("../../../../config/env.js", () => ({
      env: { NODE_ENV: nodeEnv, REFRESH_TOKEN_COOKIE_DOMAIN: undefined }
    }));
    return import("../refreshTokenCookie.js");
  }

  it("uses the unprefixed names in production", async () => {
    const mod = await namesFor("production");
    expect(mod.refreshTokenCookieName).toBe("flowledger_refresh_token");
    expect(mod.sessionPresenceCookieName).toBe("flowledger_session");
    const [refresh, presence] = mod.clearSessionCookies();
    expect(refresh).toContain("flowledger_refresh_token=;");
    expect(presence).toContain("flowledger_session=;");
    expect(refresh).toContain("Secure");
  });

  it("uses the dev names outside production", async () => {
    const mod = await namesFor("test");
    expect(mod.refreshTokenCookieName).toBe("flowledger_dev_refresh_token");
    expect(mod.sessionPresenceCookieName).toBe("flowledger_dev_session");
  });
});
