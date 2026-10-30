import { describe, expect, it } from "vitest";
import { formatExpiry, formatLastUsed } from "../apiKeyDisplay";

const now = new Date("2026-06-01T12:00:00.000Z");

describe("apiKeyDisplay", () => {
  it("formats never-expiring keys", () => {
    expect(formatExpiry(null, now)).toBe("Never expires");
  });

  it("formats absolute date plus relative days", () => {
    const text = formatExpiry("2026-07-01T12:00:00.000Z", now);
    expect(text).toContain("in 30 days");
    expect(text.startsWith("Expires ")).toBe(true);
  });

  it("formats last used", () => {
    expect(formatLastUsed(null, now)).toBe("Never used");
    expect(formatLastUsed("2026-05-31T12:00:00.000Z", now)).toBe("Last used yesterday");
  });
});
