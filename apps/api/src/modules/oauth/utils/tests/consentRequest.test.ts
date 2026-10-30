import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { env } from "../../../../config/env.js";
import { signConsentRequest, verifyConsentRequest } from "../consentRequest.js";

const claims = {
  cid: "https://app.example/c.json",
  ru: "https://app.example/cb",
  cc: "challenge",
  st: "s",
  sc: ["read"],
  rs: "https://api.example/mcp"
};

describe("consent request JWT", () => {
  it("round-trips the claims", () => {
    expect(verifyConsentRequest(signConsentRequest(claims))).toEqual(claims);
  });

  it("rejects a tampered signature, wrong audience, wrong secret, expiry and bad shape", () => {
    const good = signConsentRequest(claims);
    const wrongAud = jwt.sign(claims, env.JWT_SECRET, { audience: "google-oauth" });
    const wrongKey = jwt.sign(claims, "another-secret-0123456789", { audience: "oauth-consent" });
    const expired = jwt.sign(claims, env.JWT_SECRET, { audience: "oauth-consent", expiresIn: -1 });
    const badShape = jwt.sign({ cid: "x" }, env.JWT_SECRET, { audience: "oauth-consent" });

    for (const token of [`${good}x`, wrongAud, wrongKey, expired, badShape, "garbage"]) {
      expect(() => verifyConsentRequest(token)).toThrowError(
        expect.objectContaining({ statusCode: 400 })
      );
    }
  });

  it("expires after 10 minutes", () => {
    const { exp, iat } = jwt.decode(signConsentRequest(claims)) as { exp: number; iat: number };
    expect(exp - iat).toBe(600);
  });
});
