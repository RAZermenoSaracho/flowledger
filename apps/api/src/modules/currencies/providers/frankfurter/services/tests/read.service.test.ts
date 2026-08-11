import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../frankfurter.client.js", () => ({
  fetchFrankfurterCurrencies: vi.fn(),
  fetchFrankfurterRate: vi.fn()
}));

const { fetchFrankfurterCurrencies, fetchFrankfurterRate } = await import(
  "../../frankfurter.client.js"
);
const fetchFrankfurterCurrenciesMock = vi.mocked(fetchFrankfurterCurrencies);
const fetchFrankfurterRateMock = vi.mocked(fetchFrankfurterRate);

const { getFiatCurrencies, getFiatExchangeRate, isFiatCurrencyCode } =
  await import("../read.service.js");

const CURRENCIES_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_TTL_MS = 5 * 60 * 1000;
let simulatedNow = Date.parse("2024-01-01T00:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  simulatedNow += CURRENCIES_TTL_MS * 2;
  vi.setSystemTime(simulatedNow);
  fetchFrankfurterCurrenciesMock.mockReset();
  fetchFrankfurterRateMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getFiatCurrencies", () => {
  it("maps the raw code->name record into a currency list", async () => {
    fetchFrankfurterCurrenciesMock.mockResolvedValue({
      USD: "US Dollar",
      MXN: "Mexican Peso"
    });

    const result = await getFiatCurrencies();

    expect(result).toEqual([
      { code: "USD", name: "US Dollar", type: "fiat" },
      { code: "MXN", name: "Mexican Peso", type: "fiat" }
    ]);
  });

  it("returns an empty array without throwing when the client fails", async () => {
    fetchFrankfurterCurrenciesMock.mockRejectedValue(new Error("network down"));

    await expect(getFiatCurrencies()).resolves.toEqual([]);
  });

  it("reuses cached data within the 24h TTL without re-fetching", async () => {
    fetchFrankfurterCurrenciesMock.mockResolvedValue({ USD: "US Dollar" });

    await getFiatCurrencies();
    await getFiatCurrencies();

    expect(fetchFrankfurterCurrenciesMock).toHaveBeenCalledTimes(1);
  });

  it("re-fetches once the TTL has elapsed", async () => {
    fetchFrankfurterCurrenciesMock.mockResolvedValue({ USD: "US Dollar" });
    await getFiatCurrencies();

    vi.setSystemTime(simulatedNow + CURRENCIES_TTL_MS + 1000);
    await getFiatCurrencies();

    expect(fetchFrankfurterCurrenciesMock).toHaveBeenCalledTimes(2);
  });
});

describe("isFiatCurrencyCode", () => {
  it("always treats USD as fiat without fetching", async () => {
    expect(await isFiatCurrencyCode("USD")).toBe(true);
    expect(fetchFrankfurterCurrenciesMock).not.toHaveBeenCalled();
  });

  it("returns true/false based on the fetched currency list", async () => {
    fetchFrankfurterCurrenciesMock.mockResolvedValue({ MXN: "Mexican Peso" });

    expect(await isFiatCurrencyCode("MXN")).toBe(true);
    expect(await isFiatCurrencyCode("XYZ")).toBe(false);
  });
});

describe("getFiatExchangeRate", () => {
  it("returns 1 for the same currency without fetching", async () => {
    expect(await getFiatExchangeRate("USD", "USD")).toBe(1);
    expect(fetchFrankfurterRateMock).not.toHaveBeenCalled();
  });

  it("fetches and returns the live rate for a new pair", async () => {
    fetchFrankfurterRateMock.mockResolvedValue(17.5);

    expect(await getFiatExchangeRate("USD", "MXN")).toBe(17.5);
    expect(fetchFrankfurterRateMock).toHaveBeenCalledWith("USD", "MXN");
  });

  it("reuses a cached rate within the 5-minute TTL", async () => {
    fetchFrankfurterRateMock.mockResolvedValue(17.5);

    await getFiatExchangeRate("USD", "MXN");
    await getFiatExchangeRate("USD", "MXN");

    expect(fetchFrankfurterRateMock).toHaveBeenCalledTimes(1);
  });

  it("re-fetches a pair once its rate cache has expired", async () => {
    fetchFrankfurterRateMock.mockResolvedValue(17.5);
    await getFiatExchangeRate("USD", "MXN");

    vi.setSystemTime(simulatedNow + RATE_TTL_MS + 1000);
    fetchFrankfurterRateMock.mockResolvedValue(18);
    const rate = await getFiatExchangeRate("USD", "MXN");

    expect(fetchFrankfurterRateMock).toHaveBeenCalledTimes(2);
    expect(rate).toBe(18);
  });
});
