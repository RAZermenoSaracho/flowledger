import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, resolveExpiresAt } from "../apiKeys.js";

describe("generateApiKey", () => {
  it("returns an fl_ key, an 8 char hint and the matching hash", () => {
    const { key, hint, secretHash } = generateApiKey();
    expect(key).toMatch(/^fl_[A-Za-z0-9_-]{43}$/);
    expect(hint).toBe(key.slice(0, 8));
    expect(secretHash).toBe(hashApiKey(key));
  });

  it("generates distinct keys", () => {
    expect(generateApiKey().key).not.toBe(generateApiKey().key);
  });
});

describe("hashApiKey", () => {
  it("is deterministic hex sha256", () => {
    expect(hashApiKey("fl_x")).toBe(hashApiKey("fl_x"));
    expect(hashApiKey("fl_x")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey("fl_x")).not.toBe(hashApiKey("fl_y"));
  });
});

describe("resolveExpiresAt", () => {
  const now = new Date("2026-03-15T10:00:00.000Z");

  it("adds one day", () => {
    expect(resolveExpiresAt("1d", now)?.toISOString()).toBe("2026-03-16T10:00:00.000Z");
  });

  it("adds one calendar month", () => {
    expect(resolveExpiresAt("1m", now)?.toISOString()).toBe("2026-04-15T10:00:00.000Z");
  });

  it("clamps to month end (Jan 31 + 1m)", () => {
    const jan = new Date("2026-01-31T00:00:00.000Z");
    expect(resolveExpiresAt("1m", jan)?.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("adds one year, clamping Feb 29", () => {
    expect(resolveExpiresAt("1y", now)?.toISOString()).toBe("2027-03-15T10:00:00.000Z");
    const leap = new Date("2028-02-29T00:00:00.000Z");
    expect(resolveExpiresAt("1y", leap)?.toISOString()).toBe("2029-02-28T00:00:00.000Z");
  });

  it("returns null for never", () => {
    expect(resolveExpiresAt("never", now)).toBeNull();
  });
});
