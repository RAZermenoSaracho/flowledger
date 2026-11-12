import { describe, expect, it } from "vitest";
import { amountPrecisionError, formatCompactMoney, formatMoney, suggestAmount } from "../currency";

describe("formatMoney", () => {
  it("formats a recognized ISO currency with symbol and grouping", () => {
    expect(formatMoney(1234.5, "USD")).toBe("$1,234.50");
  });

  it("formats a different recognized currency", () => {
    expect(formatMoney(99, "EUR")).toBe("€99.00");
  });

  it("renders a non-ISO code as '<amount> <code>'", () => {
    expect(formatMoney(12.345, "US")).toBe("12.345 US");
  });

  it("renders an 18-decimal crypto string exactly", () => {
    expect(formatMoney("1.234567890123456789", "BTC")).toBe("1.234567890123456789 BTC");
  });

  it("uses zero decimals for JPY and keeps USD/MXN at two", () => {
    expect(formatMoney("1500", "JPY")).toBe("¥1,500");
    expect(formatMoney("1500", "USD")).toBe("$1,500.00");
    expect(formatMoney("10.5", "MXN")).toBe("MX$10.50");
  });
});

describe("formatCompactMoney", () => {
  it("formats a recognized currency in compact notation", () => {
    expect(formatCompactMoney(1200, "USD")).toBe("$1.2K");
  });

  it("renders a non-ISO code in compact notation with its code", () => {
    expect(formatCompactMoney(12.345, "US")).toBe("12.3 US");
  });

  it("accepts a decimal string", () => {
    expect(formatCompactMoney("1200", "USD")).toBe("$1.2K");
  });
});

describe("amountPrecisionError", () => {
  it("accepts amounts within the currency's minor units and rejects more, never rounding", () => {
    expect(amountPrecisionError("10.50", "USD")).toBeNull();
    expect(amountPrecisionError("10.005", "USD")).toMatch(/at most 2/);
    expect(amountPrecisionError("1500", "JPY")).toBeNull();
    expect(amountPrecisionError("1500.5", "JPY")).toMatch(/cannot have decimals/);
    expect(amountPrecisionError("1.234567890123456789", "BTC")).toBeNull();
    expect(amountPrecisionError("1.2345678901234567891", "BTC")).toMatch(/at most 18/);
  });
});

describe("suggestAmount", () => {
  it("converts at the rate to the target currency's precision", () => {
    expect(suggestAmount("100", 17.123, "MXN")).toBe("1712.30");
    expect(suggestAmount("100", 150.4, "JPY")).toBe("15040");
  });

  it("caps crypto at 8 decimals and trims zeros", () => {
    expect(suggestAmount("100", 0.00001, "BTC")).toBe("0.001");
  });

  it("returns null for a non-positive or invalid input", () => {
    expect(suggestAmount("", 2, "USD")).toBeNull();
    expect(suggestAmount("0", 2, "USD")).toBeNull();
    expect(suggestAmount("abc", 2, "USD")).toBeNull();
  });
});
