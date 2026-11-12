import { describe, expect, it } from "vitest";
import { valueInCurrency } from "../valuation.js";

describe("valueInCurrency", () => {
  it("rounds half-up to the currency's fraction digits", () => {
    expect(valueInCurrency("1.005", 1, "USD").toFixed()).toBe("1.01");
    expect(valueInCurrency("0.5", 1, "JPY").toFixed()).toBe("1");
  });

  it("values a crypto amount exactly without float drift", () => {
    expect(valueInCurrency("0.1", "3", "USD").toFixed()).toBe("0.3");
    expect(valueInCurrency("1.234567890123456789", 1, "BTC").toFixed()).toBe("1.234567890123456789");
  });
});
