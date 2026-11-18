import { beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({ TWELVE_DATA_API_KEY: "k" as string | undefined }));
vi.mock("../../../../../../config/env.js", () => ({ env: envMock }));
vi.mock("../credits.service.js", () => ({ reserveCredits: vi.fn(), markMinuteExhausted: vi.fn() }));
vi.mock("../../twelveData.client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../twelveData.client.js")>()),
  searchSymbols: vi.fn()
}));
vi.mock("../../../frankfurter/services/read.service.js", () => ({
  getFiatCurrencies: vi.fn(async () => [{ code: "MXN", name: "Peso", type: "fiat" }])
}));

const { reserveCredits, markMinuteExhausted } = await import("../credits.service.js");
const { searchSymbols, TwelveDataError } = await import("../../twelveData.client.js");
const { searchSecurities, clearSecuritySearchCache } = await import("../search.service.js");

const apple = (extra: Record<string, string> = {}) => ({
  symbol: "AAPL",
  instrument_name: "Apple Inc.",
  exchange: "NASDAQ",
  mic_code: "XNGS",
  country: "United States",
  currency: "USD",
  instrument_type: "Common Stock",
  ...extra
});

beforeEach(() => {
  clearSecuritySearchCache();
  envMock.TWELVE_DATA_API_KEY = "k";
  vi.mocked(reserveCredits).mockResolvedValue("reserved");
  vi.mocked(searchSymbols).mockResolvedValue([apple(), apple({ exchange: "BMV", mic_code: "XMEX", currency: "MXN" })]);
});

describe("searchSecurities", () => {
  it("is unavailable without a key and spends nothing", async () => {
    envMock.TWELVE_DATA_API_KEY = undefined;
    expect(await searchSecurities("AAPL")).toEqual({ available: false, results: [] });
    expect(reserveCredits).not.toHaveBeenCalled();
  });

  it("returns mapped results and reserves one credit", async () => {
    const response = await searchSecurities("AAPL");
    expect(response.available).toBe(true);
    expect(response.results.map((r) => r.micCode)).toEqual(["XNGS", "XMEX"]);
    expect(reserveCredits).toHaveBeenCalledWith(1, expect.any(Date));
  });

  it("serves a repeated normalized query from the cache without a credit or request", async () => {
    await searchSecurities("AAPL");
    await searchSecurities(" aapl ");
    expect(searchSymbols).toHaveBeenCalledTimes(1);
    expect(reserveCredits).toHaveBeenCalledTimes(1);
  });

  it("refetches after the one hour TTL", async () => {
    const now = Date.now();
    await searchSecurities("AAPL", now);
    await searchSecurities("AAPL", now + 60 * 60_000 + 1);
    expect(searchSymbols).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest entry beyond 500", async () => {
    for (let i = 0; i < 501; i++) await searchSecurities(`Q${i}`);
    await searchSecurities("Q0");
    expect(searchSymbols).toHaveBeenCalledTimes(502);
  });

  it("is unavailable, and not cached, when the budget is spent", async () => {
    vi.mocked(reserveCredits).mockResolvedValue("minute_full");
    expect(await searchSecurities("AAPL")).toEqual({ available: false, results: [] });
    expect(searchSymbols).not.toHaveBeenCalled();
    vi.mocked(reserveCredits).mockResolvedValue("reserved");
    expect((await searchSecurities("AAPL")).available).toBe(true);
  });

  it("is unavailable when the provider fails, marking the minute full on a rate limit", async () => {
    vi.mocked(searchSymbols).mockRejectedValue(new TwelveDataError("rate_limited", "429"));
    expect(await searchSecurities("AAPL")).toEqual({ available: false, results: [] });
    expect(markMinuteExhausted).toHaveBeenCalled();
  });
});
