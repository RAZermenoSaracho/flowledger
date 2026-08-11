import { describe, expect, it } from "vitest";
import { formatCompactMoney, formatMoney } from "../currency";

describe("formatMoney", () => {
  it("formats a recognized ISO currency with symbol and grouping", () => {
    expect(formatMoney(1234.5, "USD")).toBe("$1,234.50");
  });

  it("formats a different recognized currency", () => {
    expect(formatMoney(99, "EUR")).toBe("€99.00");
  });

  it("falls back to '<amount> <code>' for a malformed currency code Intl rejects", () => {
    expect(formatMoney(12.345, "US")).toBe("12.35 US");
  });
});

describe("formatCompactMoney", () => {
  it("formats a recognized currency in compact notation", () => {
    expect(formatCompactMoney(1200, "USD")).toBe("$1.2K");
  });

  it("falls back to '<amount> <code>' for a malformed currency code Intl rejects", () => {
    expect(formatCompactMoney(12.345, "US")).toBe("12.35 US");
  });
});
