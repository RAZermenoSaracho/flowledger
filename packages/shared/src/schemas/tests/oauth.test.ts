import { describe, expect, it } from "vitest";
import {
  cimdDocumentSchema,
  oauthConsentRequestSchema,
  oauthContextQuerySchema,
  oauthDecisionSchema
} from "../oauth.js";

const doc = {
  client_id: "https://app.example/client.json",
  redirect_uris: ["https://app.example/cb"]
};

describe("oauthDecisionSchema", () => {
  it("defaults to read-only and one month", () => {
    expect(oauthDecisionSchema.parse({ req: "r", approve: true })).toEqual({
      req: "r",
      approve: true,
      allowWrite: false,
      lifetime: "1m"
    });
  });

  it("rejects unknown lifetimes and a missing approve flag", () => {
    expect(oauthDecisionSchema.safeParse({ req: "r", approve: true, lifetime: "2d" }).success).toBe(false);
    expect(oauthDecisionSchema.safeParse({ req: "r" }).success).toBe(false);
  });
});

describe("oauthContextQuerySchema", () => {
  it("requires a non-empty req", () => {
    expect(oauthContextQuerySchema.safeParse({ req: "" }).success).toBe(false);
    expect(oauthContextQuerySchema.safeParse({ req: "x" }).success).toBe(true);
  });
});

describe("oauthConsentRequestSchema", () => {
  it("accepts the signed claims and ignores JWT registered claims", () => {
    const claims = {
      cid: doc.client_id,
      ru: "https://app.example/cb",
      cc: "c",
      sc: ["read"],
      rs: "https://api.example/mcp",
      exp: 1
    };
    expect(oauthConsentRequestSchema.safeParse(claims).success).toBe(true);
  });

  it("rejects a missing challenge", () => {
    const claims = { cid: doc.client_id, ru: doc.redirect_uris[0], sc: [], rs: "https://a.example/mcp" };
    expect(oauthConsentRequestSchema.safeParse(claims).success).toBe(false);
  });
});

describe("cimdDocumentSchema", () => {
  it("accepts https and http loopback redirect URIs", () => {
    const result = cimdDocumentSchema.safeParse({
      ...doc,
      redirect_uris: [
        "https://app.example/cb",
        "http://localhost/callback",
        "http://127.0.0.1/callback",
        "http://[::1]/cb"
      ]
    });
    expect(result.success).toBe(true);
  });

  it.each(["http://evil.example/cb", "javascript:alert(1)", "not a url", "myapp://cb"])(
    "rejects redirect %s",
    (uri) => {
      expect(cimdDocumentSchema.safeParse({ ...doc, redirect_uris: [uri] }).success).toBe(false);
    }
  );

  it("rejects an empty redirect list", () => {
    expect(cimdDocumentSchema.safeParse({ ...doc, redirect_uris: [] }).success).toBe(false);
  });
});
