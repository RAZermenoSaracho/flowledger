import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../config/env.js", () => ({ env: { PUBLIC_API_URL: "https://api.example.test/" } }));

import {
  generateAccessToken,
  generateCode,
  generateRefreshToken,
  hashToken,
  issuerUrl,
  mcpResourceMetadataUrl,
  mcpResourceUrl,
  resolveAccessExpiry
} from "../tokens.js";

describe("token generation", () => {
  it("uses distinct prefixes and 256 bits of randomness", () => {
    expect(generateAccessToken()).toMatch(/^flo_[\w-]{43}$/);
    expect(generateRefreshToken()).toMatch(/^flr_[\w-]{43}$/);
    expect(generateCode()).toMatch(/^flc_[\w-]{43}$/);
    expect(generateAccessToken()).not.toBe(generateAccessToken());
  });

  it("hashes to SHA-256 hex", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("urls", () => {
  it("derives issuer, resource and metadata URLs from PUBLIC_API_URL without a trailing slash", () => {
    expect(issuerUrl()).toBe("https://api.example.test");
    expect(mcpResourceUrl()).toBe("https://api.example.test/mcp");
    expect(mcpResourceMetadataUrl()).toBe("https://api.example.test/.well-known/oauth-protected-resource/mcp");
  });
});

describe("resolveAccessExpiry", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("is one hour out for Never and far grants", () => {
    expect(resolveAccessExpiry(now, null).toISOString()).toBe("2026-01-01T01:00:00.000Z");
    expect(resolveAccessExpiry(now, new Date("2027-01-01")).toISOString()).toBe("2026-01-01T01:00:00.000Z");
  });

  it("is capped at the grant expiry", () => {
    const soon = new Date("2026-01-01T00:10:00Z");
    expect(resolveAccessExpiry(now, soon)).toEqual(soon);
  });
});
