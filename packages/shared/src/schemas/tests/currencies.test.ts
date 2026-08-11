import { describe, expect, it } from "vitest";
import { currencyRateQuerySchema } from "../currencies.js";

describe("currencyRateQuerySchema", () => {
  it("accepts and normalizes valid from/to currency codes", () => {
    expect(
      currencyRateQuerySchema.parse({ from: "usd", to: "mxn" })
    ).toEqual({ from: "USD", to: "MXN" });
  });

  it("rejects a missing 'to' field", () => {
    expect(currencyRateQuerySchema.safeParse({ from: "USD" }).success).toBe(
      false
    );
  });

  it("rejects a code shorter than 2 characters", () => {
    expect(
      currencyRateQuerySchema.safeParse({ from: "U", to: "MXN" }).success
    ).toBe(false);
  });
});
