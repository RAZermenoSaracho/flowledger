import { describe, expect, it } from "vitest";
import {
  add,
  allocateEvenly,
  compare,
  divideToSignificant,
  fromUnits,
  isNonZero,
  isPositive,
  multiplyByRate,
  parseUnits,
  subtract,
  sum,
  toUnits
} from "../money";

describe("toUnits / fromUnits", () => {
  it("round-trips fixed decimals", () => {
    expect(toUnits("12.5", 2)).toBe(1250n);
    expect(fromUnits(1250n, 2)).toBe("12.50");
    expect(fromUnits(5n, 2)).toBe("0.05");
    expect(fromUnits(1500n, 0)).toBe("1500");
    expect(fromUnits(-5n, 2)).toBe("-0.05");
  });

  it("trims trailing zeros when asked", () => {
    expect(fromUnits(1_500_000_000_000_000_000n, 18, true)).toBe("1.5");
    expect(fromUnits(2_000_000_000_000_000_000n, 18, true)).toBe("2");
  });

  it("rejects negatives, malformed and over-precise input", () => {
    expect(() => toUnits("-1", 2)).toThrow(RangeError);
    expect(() => toUnits("abc", 2)).toThrow(RangeError);
    expect(() => toUnits("1e3", 2)).toThrow(RangeError);
    expect(() => toUnits("1.234", 2)).toThrow(RangeError);
    expect(parseUnits("1.5", "JPY")).toBeNull();
    expect(parseUnits("-1", "USD")).toBeNull();
  });

  it("handles 20 integer digits", () => {
    expect(toUnits("12345678901234567890.12", 2)).toBe(1234567890123456789012n);
    expect(add("12345678901234567890.12", "0.01", "USD")).toBe("12345678901234567890.13");
  });
});

describe("currency arithmetic", () => {
  it("adds, subtracts, compares and sums per currency", () => {
    expect(add("0.1", "0.2", "USD")).toBe("0.30");
    expect(subtract("1", "0.01", "USD")).toBe("0.99");
    expect(subtract("1", "2", "USD")).toBe("-1.00");
    expect(compare("1.10", "1.1", "USD")).toBe(0);
    expect(compare("1", "2", "JPY")).toBe(-1);
    expect(sum(["10", "", "abc", "2.5"], "USD")).toBe("12.50");
    expect(sum(["1500", "500"], "JPY")).toBe("2000");
  });

  it("keeps crypto exact and trimmed", () => {
    expect(add("0.1", "0.2", "BTC")).toBe("0.3");
    expect(subtract("1.234567890123456789", "0.62", "BTC")).toBe("0.614567890123456789");
  });

  it("classifies positive and non-zero amounts", () => {
    expect(isPositive("0.01", "USD")).toBe(true);
    expect(isPositive("0", "USD")).toBe(false);
    expect(isPositive("-1", "USD")).toBe(false);
    expect(isNonZero("0.00")).toBe(false);
    expect(isNonZero("0.01")).toBe(true);
    expect(isNonZero(undefined)).toBe(false);
  });
});

describe("allocateEvenly", () => {
  it("gives remainder units to the first slots", () => {
    expect(allocateEvenly("100.00", "MXN", 3)).toEqual(["33.34", "33.33", "33.33"]);
  });

  it("splits BTC at 18 decimals", () => {
    expect(allocateEvenly("0.01", "BTC", 3)).toEqual([
      "0.003333333333333334",
      "0.003333333333333333",
      "0.003333333333333333"
    ]);
  });

  it("sums 1 ETH / 7 exactly", () => {
    const shares = allocateEvenly("1", "ETH", 7);
    expect(shares).toHaveLength(7);
    expect(sum(shares, "ETH")).toBe("1");
    expect(shares[0]).toBe("0.142857142857142858");
    expect(shares[6]).toBe("0.142857142857142857");
  });

  it("works with zero digits and large values", () => {
    expect(allocateEvenly("100", "JPY", 3)).toEqual(["34", "33", "33"]);
    const big = allocateEvenly("12345678901234567890.01", "USD", 3);
    expect(sum(big, "USD")).toBe("12345678901234567890.01");
  });

  it("returns nothing for invalid input or n < 1", () => {
    expect(allocateEvenly("abc", "USD", 2)).toEqual([]);
    expect(allocateEvenly("-5", "USD", 2)).toEqual([]);
    expect(allocateEvenly("5", "USD", 0)).toEqual([]);
  });
});

describe("rates", () => {
  it("divides to significant digits without floats", () => {
    expect(divideToSignificant("1700", "100")).toBe("17");
    expect(divideToSignificant("1666", "100")).toBe("16.66");
    expect(divideToSignificant("1", "3")).toBe("0.33333333");
    expect(divideToSignificant("0.5", "30000", 4)).toBe("0.00001666");
    expect(divideToSignificant("0", "1")).toBeNull();
    expect(divideToSignificant("1", "x")).toBeNull();
  });

  it("multiplies by a number or string rate, truncating", () => {
    expect(multiplyByRate("100", 17.123, 2)).toBe("1712.30");
    expect(multiplyByRate("100", "0.00001", 8)).toBe("0.00100000");
    expect(multiplyByRate("100", 1e-7, 8)).toBe("0.00001000");
    expect(multiplyByRate("0", 2, 2)).toBeNull();
    expect(multiplyByRate("x", 2, 2)).toBeNull();
  });
});
