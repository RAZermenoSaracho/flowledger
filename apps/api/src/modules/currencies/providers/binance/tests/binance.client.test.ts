import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchBinanceTickerPrices } from "../binance.client.js";

describe("fetchBinanceTickerPrices", () => {
  const originalFetch = global.fetch;
  const TTL_MS = 60 * 1000;
  let simulatedNow = Date.parse("2024-01-01T00:00:00.000Z");

  // The module caches prices in a module-level variable that outlives each
  // test — every test jumps the fake clock well past the TTL first so it
  // always observes a fresh fetch, except the two tests deliberately
  // exercising the cache-hit/cache-expiry behavior.
  beforeEach(() => {
    vi.useFakeTimers();
    simulatedNow += TTL_MS * 2;
    vi.setSystemTime(simulatedNow);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("parses the ticker list into a symbol-to-price map", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { symbol: "BTCUSDT", price: "60000.12" },
        { symbol: "ETHUSDT", price: "3000.5" }
      ]
    }) as never;

    const prices = await fetchBinanceTickerPrices();

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.binance.com/api/v3/ticker/price"
    );
    expect(prices.get("BTCUSDT")).toBe(60000.12);
    expect(prices.get("ETHUSDT")).toBe(3000.5);
  });

  it("skips entries whose price is not a finite number", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        { symbol: "BTCUSDT", price: "60000" },
        { symbol: "BROKEN", price: "not-a-number" }
      ]
    }) as never;

    const prices = await fetchBinanceTickerPrices();

    expect(prices.has("BTCUSDT")).toBe(true);
    expect(prices.has("BROKEN")).toBe(false);
  });

  it("throws when the response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => []
    }) as never;

    await expect(fetchBinanceTickerPrices()).rejects.toThrow(
      "Binance responded with 503"
    );
  });

  it("serves cached prices on a second call within the TTL, without calling fetch again", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ symbol: "BTCUSDT", price: "60000" }]
    }) as never;

    const first = await fetchBinanceTickerPrices();
    const second = await fetchBinanceTickerPrices();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it("re-fetches once the cache TTL has elapsed", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ symbol: "BTCUSDT", price: "60000" }]
    }) as never;

    await fetchBinanceTickerPrices();
    vi.setSystemTime(simulatedNow + TTL_MS + 1);
    await fetchBinanceTickerPrices();

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
