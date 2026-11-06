import { describe, expect, it } from "vitest";
import { parseTransactionAmount } from "../transactions";

describe("parseTransactionAmount", () => {
  it("returns a finite number unchanged", () => {
    expect(parseTransactionAmount(42.5)).toBe(42.5);
  });

  it("returns 0 for a non-finite number", () => {
    expect(parseTransactionAmount(Infinity)).toBe(0);
    expect(parseTransactionAmount(NaN)).toBe(0);
  });

  it("parses a numeric string, trimming whitespace", () => {
    expect(parseTransactionAmount(" 42.5 ")).toBe(42.5);
  });

  it("returns 0 for a non-numeric string", () => {
    expect(parseTransactionAmount("not a number")).toBe(0);
  });

  it("returns 0 for null/undefined/other types", () => {
    expect(parseTransactionAmount(null)).toBe(0);
    expect(parseTransactionAmount(undefined)).toBe(0);
    expect(parseTransactionAmount({})).toBe(0);
  });
});
