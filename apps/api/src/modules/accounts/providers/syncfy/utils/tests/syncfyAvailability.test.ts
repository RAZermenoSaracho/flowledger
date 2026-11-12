import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../../config/env.js", () => ({
  env: { SYNCFY_AUTO_SYNC_ENABLED: true, SYNCFY_API_KEY: "test-api-key" }
}));

const { env } = await import("../../../../../../config/env.js");
const { assertSyncfyAvailable, isSyncfyAvailable } = await import(
  "../syncfyAvailability.js"
);

beforeEach(() => {
  env.SYNCFY_AUTO_SYNC_ENABLED = true;
  env.SYNCFY_API_KEY = "test-api-key";
});

describe("isSyncfyAvailable", () => {
  it("is true when the switch is on and an API key is set", () => {
    expect(isSyncfyAvailable()).toBe(true);
  });

  it("is false when the switch is off", () => {
    env.SYNCFY_AUTO_SYNC_ENABLED = false;
    expect(isSyncfyAvailable()).toBe(false);
  });

  it("is false when the API key is missing", () => {
    env.SYNCFY_API_KEY = undefined;
    expect(isSyncfyAvailable()).toBe(false);
  });
});

describe("assertSyncfyAvailable", () => {
  it("does nothing when available", () => {
    expect(() => assertSyncfyAvailable()).not.toThrow();
  });

  it("throws a 503 when unavailable", () => {
    env.SYNCFY_AUTO_SYNC_ENABLED = false;
    expect(() => assertSyncfyAvailable()).toThrow(
      expect.objectContaining({ statusCode: 503 })
    );
  });
});
