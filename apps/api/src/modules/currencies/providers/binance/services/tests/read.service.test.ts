import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../binance.client.js", () => ({
  fetchBinanceTickerPrices: vi.fn()
}));

const { fetchBinanceTickerPrices } = await import("../../binance.client.js");
const fetchBinanceTickerPricesMock = vi.mocked(fetchBinanceTickerPrices);

const { getCryptoCurrencies, getCryptoUsdtPrice, isCryptoCurrencyCode } =
  await import("../read.service.js");

const TTL_MS = 60 * 60 * 1000;
let simulatedNow = Date.parse("2024-01-01T00:00:00.000Z");

// getCryptoCurrencies() caches for an hour in a module-level variable that
// isn't reset by Vitest's mockReset — each test jumps the fake clock well
// past the TTL first, so every test (except the one deliberately testing a
// cache hit) starts from a guaranteed-expired cache.
beforeEach(() => {
  vi.useFakeTimers();
  simulatedNow += TTL_MS * 2;
  vi.setSystemTime(simulatedNow);
  fetchBinanceTickerPricesMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getCryptoCurrencies", () => {
  it("extracts and dedupes base assets from ticker symbols", async () => {
    fetchBinanceTickerPricesMock.mockResolvedValue(
      new Map([
        ["BTCUSDT", 60000],
        ["ETHUSDT", 3000],
        ["ETHBTC", 0.05]
      ])
    );

    const result = await getCryptoCurrencies();

    expect(result.map((c) => c.code).sort()).toEqual(["BTC", "ETH"]);
  });

  it("returns an empty array without throwing when the client fails", async () => {
    fetchBinanceTickerPricesMock.mockRejectedValue(new Error("network down"));

    await expect(getCryptoCurrencies()).resolves.toEqual([]);
  });

  it("reuses cached data within the TTL without re-fetching", async () => {
    fetchBinanceTickerPricesMock.mockResolvedValue(new Map([["BTCUSDT", 60000]]));

    await getCryptoCurrencies();
    await getCryptoCurrencies();

    expect(fetchBinanceTickerPricesMock).toHaveBeenCalledTimes(1);
  });

  it("re-fetches once the TTL has elapsed", async () => {
    fetchBinanceTickerPricesMock.mockResolvedValue(new Map([["BTCUSDT", 60000]]));
    await getCryptoCurrencies();

    vi.setSystemTime(simulatedNow + TTL_MS + 1000);
    await getCryptoCurrencies();

    expect(fetchBinanceTickerPricesMock).toHaveBeenCalledTimes(2);
  });
});

describe("getCryptoUsdtPrice", () => {
  it("treats USDT and USD as 1 without calling the client", async () => {
    expect(await getCryptoUsdtPrice("USDT")).toBe(1);
    expect(await getCryptoUsdtPrice("USD")).toBe(1);
    expect(fetchBinanceTickerPricesMock).not.toHaveBeenCalled();
  });

  it("returns the direct {code}USDT price when present", async () => {
    fetchBinanceTickerPricesMock.mockResolvedValue(new Map([["BTCUSDT", 60000]]));
    expect(await getCryptoUsdtPrice("BTC")).toBe(60000);
  });

  it("falls back to the inverse USDT{code} price when no direct symbol exists", async () => {
    fetchBinanceTickerPricesMock.mockResolvedValue(new Map([["USDTBTC", 0.00002]]));
    expect(await getCryptoUsdtPrice("BTC")).toBeCloseTo(1 / 0.00002, 5);
  });

  it("returns null when no matching symbol exists", async () => {
    fetchBinanceTickerPricesMock.mockResolvedValue(new Map());
    expect(await getCryptoUsdtPrice("UNKNOWN")).toBeNull();
  });
});

describe("isCryptoCurrencyCode", () => {
  it("always treats USDT as crypto without fetching", async () => {
    expect(await isCryptoCurrencyCode("USDT")).toBe(true);
    expect(fetchBinanceTickerPricesMock).not.toHaveBeenCalled();
  });

  it("returns true for a code present in the crypto currency list", async () => {
    fetchBinanceTickerPricesMock.mockResolvedValue(new Map([["BTCUSDT", 60000]]));
    expect(await isCryptoCurrencyCode("BTC")).toBe(true);
  });

  it("returns false for a code not present in the crypto currency list", async () => {
    fetchBinanceTickerPricesMock.mockResolvedValue(new Map([["BTCUSDT", 60000]]));
    expect(await isCryptoCurrencyCode("MXN")).toBe(false);
  });
});
