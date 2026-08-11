import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../../../../config/env.js";
import {
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
  beforeEach(() => {
    Object.assign(env, { NODE_ENV: "development" });
  });

  it("builds an HttpOnly, SameSite=Lax cookie scoped to the callback path", () => {
    const cookie = googleStateCookie("nonce-value", 600);

    expect(cookie).toContain(`${googleStateCookieName}=nonce-value`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/auth/google/callback");
    expect(cookie).toContain("Max-Age=600");
  });

  it("URI-encodes the nonce", () => {
    const cookie = googleStateCookie("a b", 600);
    expect(cookie).toContain(`${googleStateCookieName}=a%20b`);
  });

  it("omits Secure outside production", () => {
    expect(googleStateCookie("n", 600)).not.toContain("Secure");
  });

  it("adds Secure in production", () => {
    Object.assign(env, { NODE_ENV: "production" });
    expect(googleStateCookie("n", 600)).toContain("Secure");
  });
});
