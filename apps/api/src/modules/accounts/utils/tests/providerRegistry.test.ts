import { describe, expect, it } from "vitest";
import { getProvider, listProviders } from "../providerRegistry.js";

describe("listProviders", () => {
  it("includes the registered syncfy provider", () => {
    const keys = listProviders().map((provider) => provider.key);
    expect(keys).toContain("syncfy");
  });
});

describe("getProvider", () => {
  it("returns the syncfy provider adapter", () => {
    expect(getProvider("syncfy").key).toBe("syncfy");
  });

  it("throws a 404 HttpError for an unregistered provider key", () => {
    expect(() => getProvider("plaid" as never)).toThrow(
      "Provider plaid is not configured"
    );
  });
});
