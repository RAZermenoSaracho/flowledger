import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getExchangeRate } from "../../../currencies/services/read.service.js";
import { convertSettlementAmount } from "../settlementCurrency.js";

vi.mock("../../../currencies/services/read.service.js", () => ({
  getExchangeRate: vi.fn()
}));

const getExchangeRateMock = vi.mocked(getExchangeRate);

describe("convertSettlementAmount", () => {
  beforeEach(() => {
    getExchangeRateMock.mockReset();
  });

  it("returns the amount unchanged when currencies match, without calling the rate lookup", async () => {
    const result = await convertSettlementAmount(
      new Prisma.Decimal("100"),
      "USD",
      "USD"
    );

    expect(result).toBe(100);
    expect(getExchangeRateMock).not.toHaveBeenCalled();
  });

  it("converts using the live exchange rate and rounds to 2 decimals", async () => {
    getExchangeRateMock.mockResolvedValue(17.123456);

    const result = await convertSettlementAmount(
      new Prisma.Decimal("10"),
      "USD",
      "MXN"
    );

    expect(getExchangeRateMock).toHaveBeenCalledWith("USD", "MXN");
    expect(result).toBe(171.23);
  });
});
