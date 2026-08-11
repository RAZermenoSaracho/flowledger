import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getExchangeRate } from "../../../currencies/services/read.service.js";
import { convertAmount } from "../reportCurrency.js";

vi.mock("../../../currencies/services/read.service.js", () => ({
  getExchangeRate: vi.fn()
}));

const getExchangeRateMock = vi.mocked(getExchangeRate);

describe("convertAmount", () => {
  beforeEach(() => {
    getExchangeRateMock.mockReset();
  });

  it("returns the amount unchanged when currencies match, without a rate lookup", async () => {
    const result = await convertAmount(new Prisma.Decimal("100"), "USD", "USD");
    expect(result).toBe(100);
    expect(getExchangeRateMock).not.toHaveBeenCalled();
  });

  it("returns 0 unchanged when the amount is zero, without a rate lookup", async () => {
    const result = await convertAmount(new Prisma.Decimal("0"), "USD", "MXN");
    expect(result).toBe(0);
    expect(getExchangeRateMock).not.toHaveBeenCalled();
  });

  it("converts using the live rate and rounds to money precision", async () => {
    getExchangeRateMock.mockResolvedValue(17.123456);

    const result = await convertAmount(new Prisma.Decimal("10"), "USD", "MXN");

    expect(getExchangeRateMock).toHaveBeenCalledWith("USD", "MXN");
    expect(result).toBe(171.23);
  });
});
