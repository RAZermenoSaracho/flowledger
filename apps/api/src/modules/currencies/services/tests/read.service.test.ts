import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../providers/binance/services/read.service.js", () => ({
  getCryptoCurrencies: vi.fn(),
  getCryptoUsdtPrice: vi.fn(),
  isCryptoCurrencyCode: vi.fn()
}));

vi.mock("../../providers/frankfurter/services/read.service.js", () => ({
  getFiatCurrencies: vi.fn(),
  getFiatExchangeRate: vi.fn(),
  isFiatCurrencyCode: vi.fn()
}));

const { getCryptoCurrencies, getCryptoUsdtPrice, isCryptoCurrencyCode } =
  await import("../../providers/binance/services/read.service.js");
const { getFiatCurrencies, getFiatExchangeRate, isFiatCurrencyCode } =
  await import("../../providers/frankfurter/services/read.service.js");

const getCryptoCurrenciesMock = vi.mocked(getCryptoCurrencies);
const getCryptoUsdtPriceMock = vi.mocked(getCryptoUsdtPrice);
const isCryptoCurrencyCodeMock = vi.mocked(isCryptoCurrencyCode);
const getFiatCurrenciesMock = vi.mocked(getFiatCurrencies);
const getFiatExchangeRateMock = vi.mocked(getFiatExchangeRate);
const isFiatCurrencyCodeMock = vi.mocked(isFiatCurrencyCode);

const { getExchangeRate, listCurrencies } = await import("../read.service.js");

beforeEach(() => {
  isCryptoCurrencyCodeMock.mockResolvedValue(false);
  isFiatCurrencyCodeMock.mockResolvedValue(false);
});

describe("listCurrencies", () => {
  it("combines fiat and crypto lists, each sorted by code, plus a combined sorted list", async () => {
    getFiatCurrenciesMock.mockResolvedValue([
      { code: "USD", name: "US Dollar", type: "fiat" },
      { code: "MXN", name: "Mexican Peso", type: "fiat" }
    ]);
    getCryptoCurrenciesMock.mockResolvedValue([
      { code: "ETH", name: "ETH", type: "crypto" },
      { code: "BTC", name: "BTC", type: "crypto" }
    ]);

    const result = await listCurrencies();

    expect(result.fiat.map((c) => c.code)).toEqual(["MXN", "USD"]);
    expect(result.crypto.map((c) => c.code)).toEqual(["BTC", "ETH"]);
    expect(result.currencies.map((c) => c.code)).toEqual([
      "BTC",
      "ETH",
      "MXN",
      "USD"
    ]);
  });
});

describe("getExchangeRate", () => {
  it("returns 1 for the same currency (case-insensitive/trimmed) without any lookups", async () => {
    expect(await getExchangeRate(" usd ", "USD")).toBe(1);
    expect(isFiatCurrencyCodeMock).not.toHaveBeenCalled();
  });

  it("uses the fiat rate directly for a fiat/fiat pair", async () => {
    isFiatCurrencyCodeMock.mockResolvedValue(true);
    getFiatExchangeRateMock.mockResolvedValue(17.5);

    const rate = await getExchangeRate("USD", "MXN");

    expect(getFiatExchangeRateMock).toHaveBeenCalledWith("USD", "MXN");
    expect(rate).toBe(17.5);
    expect(getCryptoUsdtPriceMock).not.toHaveBeenCalled();
  });

  it("always treats USD as fiat even if isFiatCurrencyCode is stubbed false", async () => {
    getFiatExchangeRateMock.mockResolvedValue(1);
    isFiatCurrencyCodeMock.mockResolvedValue(true);

    await getExchangeRate("USD", "EUR");

    expect(getFiatExchangeRateMock).toHaveBeenCalledWith("USD", "EUR");
  });

  it("bridges a crypto/fiat pair through USDT prices", async () => {
    isCryptoCurrencyCodeMock.mockImplementation(async (code) => code === "BTC");
    isFiatCurrencyCodeMock.mockResolvedValue(true);
    getCryptoUsdtPriceMock.mockResolvedValue(60000);

    const rate = await getExchangeRate("BTC", "USD");

    // usdPerFrom (BTC) = 60000, usdPerTo (USD, fiat) = 1 -> rate = 60000
    expect(rate).toBe(60000);
  });

  it("bridges a crypto/crypto pair through USDT prices on both sides", async () => {
    isCryptoCurrencyCodeMock.mockResolvedValue(true);
    getCryptoUsdtPriceMock.mockImplementation(async (code) =>
      code === "BTC" ? 60000 : 3000
    );

    const rate = await getExchangeRate("BTC", "ETH");

    expect(rate).toBe(20);
  });

  it("throws a 502 when a crypto asset has no resolvable USDT price", async () => {
    isCryptoCurrencyCodeMock.mockResolvedValue(true);
    getCryptoUsdtPriceMock.mockResolvedValue(null);

    await expect(getExchangeRate("UNKNOWN", "USD")).rejects.toThrow(
      "Exchange rate is unavailable for UNKNOWN"
    );
  });
});
