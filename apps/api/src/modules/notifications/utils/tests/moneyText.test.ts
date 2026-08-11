import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { moneyText } from "../moneyText.js";

describe("moneyText", () => {
  it("formats a plain number with a $ prefix and 2 decimals", () => {
    expect(moneyText(42)).toBe("$42.00");
  });

  it("formats a Prisma Decimal", () => {
    expect(moneyText(new Prisma.Decimal("100.5"))).toBe("$100.50");
  });

  it("rounds to 2 decimal places", () => {
    expect(moneyText(10.126)).toBe("$10.13");
  });

  it("formats a negative amount", () => {
    expect(moneyText(-5)).toBe("$-5.00");
  });
});
