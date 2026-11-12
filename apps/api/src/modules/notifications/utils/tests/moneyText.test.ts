import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { moneyText } from "../moneyText.js";

describe("moneyText", () => {
  it("appends the upper-cased currency code to a string amount", () => {
    expect(moneyText("42", "mxn")).toBe("42 MXN");
  });

  it("formats a Prisma Decimal without rounding", () => {
    expect(moneyText(new Prisma.Decimal("100.5"), "USD")).toBe("100.5 USD");
    expect(moneyText(new Prisma.Decimal("10.126"), "USD")).toBe("10.126 USD");
  });

  it("keeps all 18 crypto decimals and avoids exponent notation", () => {
    expect(moneyText("0.000000000000000001", "ETH")).toBe("0.000000000000000001 ETH");
    expect(moneyText(new Prisma.Decimal("0.0000001"), "BTC")).toBe("0.0000001 BTC");
  });

  it("formats a negative amount", () => {
    expect(moneyText("-5", "USD")).toBe("-5 USD");
  });
});
