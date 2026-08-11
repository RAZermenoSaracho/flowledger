import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { env } from "../../../../config/env.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken
} from "../tokens.js";

describe("signAccessToken", () => {
  it("signs a JWT with the user's id as subject and email as a claim", () => {
    const token = signAccessToken({ id: "user-1", email: "user1@example.com" });
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;

    expect(payload.sub).toBe("user-1");
    expect(payload.email).toBe("user1@example.com");
  });
});

describe("generateRefreshToken", () => {
  it("generates a token, its hash, and a future expiry", () => {
    const before = Date.now();
    const { token, tokenHash, expiresAt } = generateRefreshToken();

    expect(token).toHaveLength(64);
    expect(tokenHash).toBe(hashRefreshToken(token));
    expect(expiresAt.getTime()).toBeGreaterThan(before);
  });

  it("generates a different token on each call", () => {
    expect(generateRefreshToken().token).not.toBe(generateRefreshToken().token);
  });
});

describe("hashRefreshToken", () => {
  it("is deterministic for the same input", () => {
    expect(hashRefreshToken("same-token")).toBe(hashRefreshToken("same-token"));
  });

  it("produces a 64-character hex SHA-256 digest", () => {
    expect(hashRefreshToken("token")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for different inputs", () => {
    expect(hashRefreshToken("a")).not.toBe(hashRefreshToken("b"));
  });
});
