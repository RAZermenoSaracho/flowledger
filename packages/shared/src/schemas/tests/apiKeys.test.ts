import { describe, expect, it } from "vitest";
import { createApiKeySchema, credentialLifetimeSchema } from "../apiKeys.js";

describe("credentialLifetimeSchema", () => {
  it.each(["1d", "1m", "1y", "never"])("accepts %s", (value) => {
    expect(credentialLifetimeSchema.parse(value)).toBe(value);
  });

  it("rejects an unknown lifetime", () => {
    expect(credentialLifetimeSchema.safeParse("2y").success).toBe(false);
  });
});

describe("createApiKeySchema", () => {
  it("defaults to read-only with a one month lifetime", () => {
    expect(createApiKeySchema.parse({ name: "CI" })).toEqual({
      name: "CI",
      allowWrite: false,
      ingestOnly: false,
      lifetime: "1m"
    });
  });

  it("trims the name", () => {
    expect(createApiKeySchema.parse({ name: "  CI  " }).name).toBe("CI");
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(createApiKeySchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a name over 60 characters", () => {
    expect(createApiKeySchema.safeParse({ name: "a".repeat(61) }).success).toBe(false);
  });

  it("rejects a bad lifetime", () => {
    expect(createApiKeySchema.safeParse({ name: "CI", lifetime: "5d" }).success).toBe(false);
  });

  it("accepts an ingest-only key", () => {
    expect(createApiKeySchema.parse({ name: "CI", ingestOnly: true }).ingestOnly).toBe(true);
  });

  it("rejects ingestOnly combined with allowWrite", () => {
    expect(createApiKeySchema.safeParse({ name: "CI", ingestOnly: true, allowWrite: true }).success).toBe(false);
  });
});
