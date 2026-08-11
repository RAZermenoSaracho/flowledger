import { beforeEach, describe, expect, it, vi } from "vitest";
import { getExchangeRate } from "../../../currencies/services/read.service.js";
import { resolveTransactionCurrencyFields } from "../transactionCurrency.js";

vi.mock("../../../currencies/services/read.service.js", () => ({
  getExchangeRate: vi.fn()
}));

const getExchangeRateMock = vi.mocked(getExchangeRate);

describe("resolveTransactionCurrencyFields", () => {
  beforeEach(() => {
    getExchangeRateMock.mockReset();
  });

  it("normalizes currency codes to uppercase and converts using preferredCurrency", async () => {
    getExchangeRateMock.mockResolvedValue(2);

    const result = await resolveTransactionCurrencyFields({
      executionCurrency: "usd",
      amount: 100,
      preferredCurrency: "mxn"
    });

    expect(getExchangeRateMock).toHaveBeenCalledWith("USD", "MXN");
    expect(result).toEqual({
      executionCurrency: "USD",
      exchangeRate: 2,
      amountInPreferredCurrency: 200
    });
  });

  it("falls back to executionCurrency when preferredCurrency is null", async () => {
    getExchangeRateMock.mockResolvedValue(1);

    const result = await resolveTransactionCurrencyFields({
      executionCurrency: "usd",
      amount: 50,
      preferredCurrency: null
    });

    expect(getExchangeRateMock).toHaveBeenCalledWith("USD", "USD");
    expect(result.amountInPreferredCurrency).toBe(50);
  });

  it("rounds the converted amount to 2 decimals", async () => {
    getExchangeRateMock.mockResolvedValue(17.123456);

    const result = await resolveTransactionCurrencyFields({
      executionCurrency: "usd",
      amount: 10,
      preferredCurrency: "mxn"
    });

    expect(result.amountInPreferredCurrency).toBe(171.23);
  });
});
