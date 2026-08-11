import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../../../../config/env.js";
import {
  buildSyncfyApiUrl,
  buildSyncfyDataUrl,
  extractSyncfyList,
  extractSyncfyToken,
  extractSyncfyUser,
  fetchJson,
  getJsonObject,
  getNumber,
  getString,
  requiredNumber,
  requiredString,
  sanitizeSyncfyDataEndpoint,
  toJsonValue,
  uniqueStrings,
  unixTimestampToDate,
  wait,
  withTimeout
} from "../syncfyHttp.js";

vi.mock("../../../../../../config/env.js", () => ({
  env: {
    SYNCFY_API_BASE_URL: "https://api.syncfy.test",
    SYNCFY_DATA_BASE_URL: "https://data.syncfy.test",
    SYNCFY_API_KEY: "test-api-key"
  }
}));

describe("getJsonObject", () => {
  it("returns a plain object unchanged", () => {
    expect(getJsonObject({ a: 1 })).toEqual({ a: 1 });
  });

  it("returns undefined for an array, null, or primitive", () => {
    expect(getJsonObject([1])).toBeUndefined();
    expect(getJsonObject(null)).toBeUndefined();
    expect(getJsonObject("x")).toBeUndefined();
  });
});

describe("getString / getNumber", () => {
  it("getString returns a non-empty string, undefined otherwise", () => {
    expect(getString("abc")).toBe("abc");
    expect(getString("")).toBeUndefined();
    expect(getString(42)).toBeUndefined();
  });

  it("getNumber returns a finite number or coerces a numeric string", () => {
    expect(getNumber(42)).toBe(42);
    expect(getNumber("42.5")).toBe(42.5);
    expect(getNumber("abc")).toBeUndefined();
    expect(getNumber(NaN)).toBeUndefined();
  });
});

describe("requiredString / requiredNumber", () => {
  it("requiredString returns the first present key's value", () => {
    expect(requiredString({ b: "value" }, ["a", "b"], "field")).toBe("value");
  });

  it("requiredString throws a 502 when no key is present", () => {
    expect(() => requiredString({}, ["a"], "field")).toThrow(
      "Syncfy payload is missing field"
    );
  });

  it("requiredNumber returns the first present key's numeric value", () => {
    expect(requiredNumber({ b: "10" }, ["a", "b"], "field")).toBe(10);
  });

  it("requiredNumber throws a 502 when no key is present", () => {
    expect(() => requiredNumber({}, ["a"], "field")).toThrow(
      "Syncfy payload is missing field"
    );
  });
});

describe("uniqueStrings", () => {
  it("drops undefined and de-dupes, preserving first-seen order", () => {
    expect(uniqueStrings(["a", undefined, "b", "a"])).toEqual(["a", "b"]);
  });
});

describe("unixTimestampToDate", () => {
  it("interprets a seconds-magnitude timestamp", () => {
    const date = unixTimestampToDate(1700000000, "field");
    expect(date.getTime()).toBe(1700000000 * 1000);
  });

  it("interprets a milliseconds-magnitude timestamp", () => {
    const date = unixTimestampToDate(1700000000000, "field");
    expect(date.getTime()).toBe(1700000000000);
  });

  it("throws a 502 when the value is missing", () => {
    expect(() => unixTimestampToDate(undefined, "field")).toThrow(
      "Syncfy payload is missing field"
    );
  });

  it("throws a 502 when the value produces an invalid date", () => {
    expect(() => unixTimestampToDate(Number.MAX_SAFE_INTEGER, "field")).toThrow(
      "Syncfy payload has invalid field"
    );
  });
});

describe("extractSyncfyToken", () => {
  it("reads a top-level token", () => {
    expect(extractSyncfyToken({ token: "abc" })).toBe("abc");
  });

  it("reads a token nested under response", () => {
    expect(extractSyncfyToken({ response: { token: "nested" } })).toBe(
      "nested"
    );
  });

  it("returns undefined when no token is present", () => {
    expect(extractSyncfyToken({})).toBeUndefined();
  });
});

describe("extractSyncfyList", () => {
  it("returns a bare array unchanged", () => {
    expect(extractSyncfyList([1, 2], "items")).toEqual([1, 2]);
  });

  it("returns a response array", () => {
    expect(extractSyncfyList({ response: [1, 2] }, "items")).toEqual([1, 2]);
  });

  it("returns key nested under response", () => {
    expect(
      extractSyncfyList({ response: { items: [1, 2] } }, "items")
    ).toEqual([1, 2]);
  });

  it("returns key nested at the top level", () => {
    expect(extractSyncfyList({ items: [1, 2] }, "items")).toEqual([1, 2]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(extractSyncfyList({}, "items")).toEqual([]);
  });
});

describe("extractSyncfyUser", () => {
  it("prefers the nested response object", () => {
    expect(extractSyncfyUser({ response: { id: "u1" }, id: "top" })).toEqual({
      id: "u1"
    });
  });

  it("falls back to the top-level body when there's no response object", () => {
    expect(extractSyncfyUser({ id: "top" })).toEqual({ id: "top" });
  });

  it("falls back to the raw value when it's not an object", () => {
    expect(extractSyncfyUser("raw")).toBe("raw");
  });
});

describe("buildSyncfyApiUrl", () => {
  it("appends the configured api_key", () => {
    const url = buildSyncfyApiUrl("/v1/users");
    expect(url.origin).toBe("https://api.syncfy.test");
    expect(url.searchParams.get("api_key")).toBe("test-api-key");
  });

  it("throws a 500 when no API key is configured", () => {
    Object.assign(env, { SYNCFY_API_KEY: undefined });
    expect(() => buildSyncfyApiUrl("/v1/users")).toThrow(
      "Syncfy API key is not configured"
    );
    Object.assign(env, { SYNCFY_API_KEY: "test-api-key" });
  });
});

describe("buildSyncfyDataUrl", () => {
  it("appends the token to a same-origin endpoint", () => {
    const url = buildSyncfyDataUrl("/v1/accounts", "tok-1");
    expect(url.origin).toBe("https://data.syncfy.test");
    expect(url.searchParams.get("token")).toBe("tok-1");
  });

  it("throws a 400 for an endpoint resolving to a different host", () => {
    expect(() =>
      buildSyncfyDataUrl("https://evil.example.com/v1/accounts", "tok-1")
    ).toThrow("Unexpected Syncfy endpoint host");
  });
});

describe("sanitizeSyncfyDataEndpoint", () => {
  it("strips sensitive query params", () => {
    const sanitized = sanitizeSyncfyDataEndpoint(
      "/v1/accounts?token=secret&api_key=secret&keep=1"
    );
    expect(sanitized).toBe("/v1/accounts?keep=1");
  });

  it("throws a 400 for a cross-host endpoint", () => {
    expect(() =>
      sanitizeSyncfyDataEndpoint("https://evil.example.com/v1/accounts")
    ).toThrow("Unexpected Syncfy endpoint host");
  });
});

describe("fetchJson", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns the parsed JSON body on a 2xx response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true })
    }) as never;

    await expect(fetchJson(new URL("https://data.syncfy.test/v1/x"))).resolves.toEqual(
      { ok: true }
    );
  });

  it("throws a 502 on a non-OK response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => null
    }) as never;

    await expect(
      fetchJson(new URL("https://data.syncfy.test/v1/x"))
    ).rejects.toThrow("Syncfy request failed with status 500");
  });
});

describe("toJsonValue", () => {
  it("strips undefined fields", () => {
    expect(toJsonValue({ a: 1, b: undefined })).toEqual({ a: 1 });
  });

  it("converts a null/undefined root to null", () => {
    expect(toJsonValue(undefined)).toBeNull();
  });
});

describe("wait", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves immediately for ms <= 0", async () => {
    await expect(wait(0)).resolves.toBeUndefined();
  });

  it("resolves after the given delay", async () => {
    const promise = wait(100);
    vi.advanceTimersByTime(100);
    await expect(promise).resolves.toBeUndefined();
  });
});

describe("withTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves with the promise's value when it settles before the timeout", async () => {
    const promise = withTimeout(Promise.resolve("done"), 1000);
    await expect(promise).resolves.toBe("done");
  });

  it("rejects with a 504 when the promise doesn't settle in time", async () => {
    const never = new Promise(() => {});
    const promise = withTimeout(never, 1000);
    vi.advanceTimersByTime(1000);
    await expect(promise).rejects.toThrow("Syncfy resync timed out");
  });

  it("rejects with the original promise's rejection reason", async () => {
    const promise = withTimeout(Promise.reject(new Error("boom")), 1000);
    await expect(promise).rejects.toThrow("boom");
  });
});
