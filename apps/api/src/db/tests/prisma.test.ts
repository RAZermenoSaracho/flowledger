import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import "../prisma.js";

describe("Prisma.Decimal configuration", () => {
  it("keeps 18 fraction digits exact when adding to an integer", () => {
    expect(new Prisma.Decimal("100").plus("1.234567890123456789").toFixed()).toBe("101.234567890123456789");
  });

  it("keeps a 20-integer-digit plus 18-decimal sum exact", () => {
    const sum = new Prisma.Decimal("12345678901234567890.000000000000000001").plus("0.999999999999999999");
    expect(sum.toFixed()).toBe("12345678901234567891");
  });

  it("rounds half up", () => {
    expect(new Prisma.Decimal("2.5").toDecimalPlaces(0).toFixed()).toBe("3");
    expect(new Prisma.Decimal("-2.5").toDecimalPlaces(0).toFixed()).toBe("-3");
  });
});
