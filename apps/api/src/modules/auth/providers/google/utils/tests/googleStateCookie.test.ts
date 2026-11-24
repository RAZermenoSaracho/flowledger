import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../../../../config/env.js";
import {
  googleLinkPendingCookie,
  googleLinkPendingCookieName,
  googleStateCookie,
  googleStateCookieName,
  parseCookies
} from "../googleStateCookie.js";

vi.mock("../../../../../../config/env.js", () => ({
  env: { NODE_ENV: "development" }
}));

describe("parseCookies", () => {
  it("parses multiple cookies from a header", () => {
    const cookies = parseCookies("a=1; b=2");
    expect(cookies.get("a")).toBe("1");
    expect(cookies.get("b")).toBe("2");
  });

  it("returns an empty map for undefined", () => {
    expect(parseCookies(undefined).size).toBe(0);
  });
});

describe("googleStateCookie", () => {
  describe("secure mode", () => {
    beforeEach(() => {
      Object.assign(env, { NODE_ENV: "production" });
    });

    it("uses the __Host- name with Secure, Path=/, no Domain", () => {
      const cookie = googleStateCookie("nonce-value", 600);

      expect(googleStateCookieName()).toBe("__Host-flowledger_google_oauth_state");
      expect(cookie).toContain("__Host-flowledger_google_oauth_state=nonce-value");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("Path=/;");
      expect(cookie).not.toContain("Domain");
      expect(cookie).toContain("Max-Age=600");
    });

    it("clears with the same name and attributes", () => {
      const cookie = googleStateCookie("", 0);

      expect(cookie).toContain("__Host-flowledger_google_oauth_state=;");
      expect(cookie).toContain("Max-Age=0");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("Path=/;");
    });
  });

  describe("HTTP mode", () => {
    beforeEach(() => {
      Object.assign(env, { NODE_ENV: "development", WEB_APP_URL: "http://localhost:5173" });
    });

    it("keeps the legacy name and callback path without Secure", () => {
      const cookie = googleStateCookie("a b", 600);

      expect(googleStateCookieName()).toBe("flowledger_google_oauth_state");
      expect(cookie).toContain("flowledger_google_oauth_state=a%20b");
      expect(cookie).toContain("Path=/auth/google/callback");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).not.toContain("Secure");
      expect(cookie).not.toContain("Domain");
    });

    it("clears with the same name and path", () => {
      const cookie = googleStateCookie("", 0);

      expect(cookie).toContain("flowledger_google_oauth_state=;");
      expect(cookie).toContain("Max-Age=0");
      expect(cookie).toContain("Path=/auth/google/callback");
    });
  });
});

describe("googleLinkPendingCookie", () => {
  beforeEach(() => {
    Object.assign(env, { NODE_ENV: "development" });
  });

  it("builds an HttpOnly, SameSite=Lax cookie scoped to the link path", () => {
    const cookie = googleLinkPendingCookie("a b", 300);

    expect(cookie).toContain(`${googleLinkPendingCookieName}=a%20b`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/auth/google/link;");
    expect(cookie).toContain("Max-Age=300");
    expect(cookie).not.toContain("Secure");
  });

  it("expires with Max-Age=0 and adds Secure in production", () => {
    Object.assign(env, { NODE_ENV: "production" });
    const cookie = googleLinkPendingCookie("", 0);

    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("Secure");
  });
});
