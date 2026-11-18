import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../config/env.js", () => ({ env: { TWELVE_DATA_API_KEY: "secret-key" } }));

const { fetchQuote, searchSymbols, TwelveDataError } = await import("../twelveData.client.js");

const original = global.fetch;
const respond = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  global.fetch = original;
});

const quoteBody = {
  symbol: "AAPL",
  currency: "USD",
  timestamp: 1763326740,
  last_quote_at: 1763326740,
  close: "352.78000",
  is_market_open: false
};

describe("fetchQuote", () => {
  it("sends the key in the Authorization header only and keeps the price as a decimal string", async () => {
    global.fetch = respond(200, quoteBody) as never;

    const quote = await fetchQuote("AAPL", "XNGS");

    const [url, init] = vi.mocked(global.fetch).mock.calls[0]!;
    expect(String(url)).toBe("https://api.twelvedata.com/quote?symbol=AAPL&mic_code=XNGS");
    expect(String(url)).not.toContain("secret-key");
    expect((init as RequestInit).headers).toEqual({ Authorization: "apikey secret-key" });
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal);
    expect(quote).toEqual({ price: "352.78000", currency: "USD", quotedAt: new Date(1763326740 * 1000), marketOpen: false });
  });

  it("falls back to timestamp when last_quote_at is missing and reads is_market_open", async () => {
    global.fetch = respond(200, { ...quoteBody, last_quote_at: undefined, timestamp: 1763000000, is_market_open: true }) as never;
    expect(await fetchQuote("AAPL", "XNGS")).toMatchObject({ quotedAt: new Date(1763000000 * 1000), marketOpen: true });
  });

  it.each([
    ["missing close", { ...quoteBody, close: undefined }],
    ["non-numeric close", { ...quoteBody, close: "abc" }],
    ["zero close", { ...quoteBody, close: "0" }],
    ["missing currency", { ...quoteBody, currency: undefined }],
    ["missing times", { ...quoteBody, timestamp: undefined, last_quote_at: undefined }]
  ])("maps %s to invalid_quote", async (_name, body) => {
    global.fetch = respond(200, body) as never;
    await expect(fetchQuote("AAPL", "XNGS")).rejects.toMatchObject({ reason: "invalid_quote" });
  });

  it("maps the live Basic-plan XMEX answer (404 with a plan message) to plan_restricted", async () => {
    global.fetch = respond(404, {
      code: 404,
      message: "This symbol is available starting with the Pro or Venture plan. Consider upgrading now at https://twelvedata.com/pricing",
      status: "error"
    }) as never;
    await expect(fetchQuote("NAFTRACISHRS", "XMEX")).rejects.toMatchObject({ reason: "plan_restricted" });
  });

  it("maps the XMEX plan message (403) to plan_restricted", async () => {
    global.fetch = respond(403, {
      code: 403,
      message: "This symbol is available starting with Pro",
      status: "error"
    }) as never;
    await expect(fetchQuote("NAFTRACISHRS", "XMEX")).rejects.toMatchObject({ reason: "plan_restricted" });
  });

  it("handles an error body delivered with HTTP 200", async () => {
    global.fetch = respond(200, { code: 403, message: "plan", status: "error" }) as never;
    await expect(fetchQuote("X", "XMEX")).rejects.toMatchObject({ reason: "plan_restricted" });
  });

  it("distinguishes a per-minute 429 from a daily one", async () => {
    global.fetch = respond(429, { code: 429, message: "You have run out of API credits for the current minute.", status: "error" }) as never;
    await expect(fetchQuote("AAPL", "XNGS")).rejects.toMatchObject({ reason: "rate_limited" });

    global.fetch = respond(200, { code: 429, message: "You have run out of API credits for the day.", status: "error" }) as never;
    await expect(fetchQuote("AAPL", "XNGS")).rejects.toMatchObject({ reason: "quota_exhausted" });
  });

  it.each([
    [404, "not_found"],
    [401, "unavailable"],
    [500, "unavailable"]
  ])("maps HTTP %i to %s", async (status, reason) => {
    global.fetch = respond(status, { code: status, message: "x", status: "error" }) as never;
    await expect(fetchQuote("AAPL", "XNGS")).rejects.toMatchObject({ reason });
  });

  it("maps a network failure or timeout to unavailable without leaking the key", async () => {
    global.fetch = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")) as never;
    const error = await fetchQuote("AAPL", "XNGS").catch((e) => e);
    expect(error).toBeInstanceOf(TwelveDataError);
    expect(error).toMatchObject({ reason: "unavailable" });
    expect(error.message).not.toContain("secret-key");
  });
});

describe("searchSymbols", () => {
  it("requests 30 results and keeps well-formed entries", async () => {
    global.fetch = respond(200, {
      status: "ok",
      data: [
        { symbol: "AAPL", instrument_name: "Apple Inc", exchange: "NASDAQ", mic_code: "XNGS", country: "United States", currency: "USD", instrument_type: "Common Stock" },
        { symbol: "BAD" }
      ]
    }) as never;

    const results = await searchSymbols("AAPL");

    expect(String(vi.mocked(global.fetch).mock.calls[0]![0])).toBe("https://api.twelvedata.com/symbol_search?symbol=AAPL&outputsize=30");
    expect(results.map((item) => item.symbol)).toEqual(["AAPL"]);
  });

  it("rejects an unexpected body", async () => {
    global.fetch = respond(200, { status: "ok" }) as never;
    await expect(searchSymbols("AAPL")).rejects.toMatchObject({ reason: "unavailable" });
  });
});
