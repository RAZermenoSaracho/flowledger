import { describe, expect, it } from "vitest";
import {
  PROVIDER_UNAVAILABLE_MESSAGE,
  assertProviderAvailable,
  isProviderAvailable
} from "../providerAvailability.js";

const adapter = (isAvailable?: () => boolean) =>
  ({ key: "syncfy", displayName: "Syncfy", isAvailable }) as never;

describe("isProviderAvailable", () => {
  it("treats an adapter without isAvailable as available", () => {
    expect(isProviderAvailable(adapter())).toBe(true);
  });

  it("follows the adapter's isAvailable", () => {
    expect(isProviderAvailable(adapter(() => false))).toBe(false);
    expect(isProviderAvailable(adapter(() => true))).toBe(true);
  });
});

describe("assertProviderAvailable", () => {
  it("does not throw for an available provider", () => {
    expect(() => assertProviderAvailable(adapter())).not.toThrow();
  });

  it("throws a 503 with the unavailable message when isAvailable is false", () => {
    expect(() => assertProviderAvailable(adapter(() => false))).toThrow(
      expect.objectContaining({
        statusCode: 503,
        message: PROVIDER_UNAVAILABLE_MESSAGE
      })
    );
  });
});
