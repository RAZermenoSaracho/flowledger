import { describe, expect, it } from "vitest";
import { roundMoney } from "../roundMoney.js";

describe("roundMoney", () => {
  it("rounds to 2 decimal places", () => {
    expect(roundMoney(10.126)).toBe(10.13);
    expect(roundMoney(10.124)).toBe(10.12);
  });

  it("leaves an already-2-decimal value unchanged", () => {
    expect(roundMoney(42.5)).toBe(42.5);
  });

  it("rounds a negative number correctly", () => {
    expect(roundMoney(-10.126)).toBe(-10.13);
  });

  it("rounds an integer to itself", () => {
    expect(roundMoney(100)).toBe(100);
  });
});
