import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../../../tests/helpers/prismaMock.js";

const envMock = vi.hoisted(() => ({
  TWELVE_DATA_API_KEY: "k" as string | undefined,
  SECURITIES_QUOTE_REFRESH_MINUTES: 60,
  SECURITIES_QUOTE_CLOSED_RECHECK_MINUTES: 240
}));
vi.mock("../../../../../../config/env.js", () => ({ env: envMock }));
vi.mock("../credits.service.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../credits.service.js")>()),
  reserveCredits: vi.fn(),
  markMinuteExhausted: vi.fn()
}));
vi.mock("../../twelveData.client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../twelveData.client.js")>()),
  fetchQuote: vi.fn()
}));

const { reserveCredits, markMinuteExhausted } = await import("../credits.service.js");
const { fetchQuote, TwelveDataError } = await import("../../twelveData.client.js");
const { refreshSecurityQuotes } = await import("../quotes.service.js");

const NOW = new Date("2026-11-17T15:10:20Z");
const AAPL = { symbol: "AAPL", exchange: "XNGS", quoteCurrency: "USD" };
const MSFT = { symbol: "MSFT", exchange: "XNGS", quoteCurrency: "USD" };
const KEY = { symbol_exchange: { symbol: "AAPL", exchange: "XNGS" } };
const quote = { price: "352.78", currency: "USD", quotedAt: new Date("2026-11-17T15:09:00Z"), marketOpen: true };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  envMock.TWELVE_DATA_API_KEY = "k";
  prismaMock.securityQuote.createMany.mockResolvedValue({ count: 1 } as never);
  prismaMock.securityQuote.updateMany.mockResolvedValue({ count: 1 } as never);
  prismaMock.securityQuote.findUnique.mockResolvedValue({ failureCount: 0 } as never);
  vi.mocked(reserveCredits).mockResolvedValue("reserved");
  vi.mocked(fetchQuote).mockResolvedValue(quote);
});

describe("refreshSecurityQuotes", () => {
  it("does nothing without an API key", async () => {
    envMock.TWELVE_DATA_API_KEY = undefined;
    await refreshSecurityQuotes([AAPL]);
    expect(prismaMock.securityQuote.createMany).not.toHaveBeenCalled();
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it("creates the row, claims a 2 minute lease, fetches and stores an open-market success", async () => {
    await refreshSecurityQuotes([AAPL]);

    expect(prismaMock.securityQuote.createMany).toHaveBeenCalledWith({
      data: [{ symbol: "AAPL", exchange: "XNGS", nextAttemptAt: NOW }],
      skipDuplicates: true
    });
    expect(prismaMock.securityQuote.updateMany).toHaveBeenCalledWith({
      where: { symbol: "AAPL", exchange: "XNGS", nextAttemptAt: { lte: NOW } },
      data: { nextAttemptAt: new Date(NOW.getTime() + 2 * 60_000) }
    });
    expect(fetchQuote).toHaveBeenCalledWith("AAPL", "XNGS");
    expect(prismaMock.securityQuote.update).toHaveBeenCalledWith({
      where: KEY,
      data: {
        currency: "USD",
        price: "352.78",
        quotedAt: quote.quotedAt,
        checkedAt: NOW,
        marketOpen: true,
        failedAt: null,
        failureReason: null,
        failureCount: 0,
        nextAttemptAt: new Date(NOW.getTime() + 60 * 60_000)
      }
    });
  });

  it("uses the closed-market recheck interval when the market is closed", async () => {
    vi.mocked(fetchQuote).mockResolvedValue({ ...quote, marketOpen: false });
    await refreshSecurityQuotes([AAPL]);
    expect(prismaMock.securityQuote.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nextAttemptAt: new Date(NOW.getTime() + 240 * 60_000) }) })
    );
  });

  it("skips a listing another caller already claimed, without spending credits", async () => {
    prismaMock.securityQuote.updateMany.mockResolvedValue({ count: 0 } as never);
    await refreshSecurityQuotes([AAPL]);
    expect(reserveCredits).not.toHaveBeenCalled();
    expect(fetchQuote).not.toHaveBeenCalled();
  });

  it("sends one request when several accounts or users hold the same listing", async () => {
    await refreshSecurityQuotes([AAPL, { ...AAPL }, { ...AAPL }]);
    expect(fetchQuote).toHaveBeenCalledTimes(1);
  });

  it("stops at the minute budget, releasing the claim until the next minute", async () => {
    vi.mocked(reserveCredits).mockResolvedValueOnce("reserved").mockResolvedValueOnce("minute_full");
    await refreshSecurityQuotes([AAPL, MSFT, { symbol: "NVDA", exchange: "XNGS", quoteCurrency: "USD" }]);

    expect(fetchQuote).toHaveBeenCalledTimes(1);
    expect(prismaMock.securityQuote.updateMany).toHaveBeenLastCalledWith({
      where: { symbol: "MSFT", exchange: "XNGS" },
      data: { nextAttemptAt: new Date("2026-11-17T15:11:00Z") }
    });
    expect(prismaMock.securityQuote.update).toHaveBeenCalledTimes(1);
  });

  it("records quota_exhausted until 00:00 UTC when the day budget is spent", async () => {
    vi.mocked(reserveCredits).mockResolvedValue("day_full");
    await refreshSecurityQuotes([AAPL]);

    expect(fetchQuote).not.toHaveBeenCalled();
    expect(prismaMock.securityQuote.update).toHaveBeenCalledWith({
      where: KEY,
      data: expect.objectContaining({ failureReason: "quota_exhausted", nextAttemptAt: new Date("2026-11-18T00:00:00Z") })
    });
  });

  it("records a failure without touching price, currency, quotedAt or checkedAt", async () => {
    vi.mocked(fetchQuote).mockRejectedValue(new TwelveDataError("unavailable", "down"));
    await refreshSecurityQuotes([AAPL]);

    const { data } = vi.mocked(prismaMock.securityQuote.update).mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(data).toEqual({
      failedAt: NOW,
      failureReason: "unavailable",
      failureCount: { increment: 1 },
      nextAttemptAt: new Date(NOW.getTime() + 15 * 60_000)
    });
    for (const untouched of ["price", "currency", "quotedAt", "checkedAt"]) expect(data).not.toHaveProperty(untouched);
  });

  it("backs off exponentially from 15 minutes up to 6 hours", async () => {
    vi.mocked(fetchQuote).mockRejectedValue(new TwelveDataError("unavailable", "down"));
    const delays: number[] = [];
    for (const failureCount of [1, 2, 5]) {
      prismaMock.securityQuote.findUnique.mockResolvedValue({ failureCount } as never);
      prismaMock.securityQuote.update.mockClear();
      await refreshSecurityQuotes([AAPL]);
      const { data } = vi.mocked(prismaMock.securityQuote.update).mock.calls[0]![0] as { data: { nextAttemptAt: Date } };
      delays.push((data.nextAttemptAt.getTime() - NOW.getTime()) / 60_000);
    }
    expect(delays).toEqual([30, 60, 360]);
  });

  it.each([
    ["plan_restricted"],
    ["not_found"],
    ["invalid_quote"]
  ] as const)("waits 24 hours after %s", async (reason) => {
    vi.mocked(fetchQuote).mockRejectedValue(new TwelveDataError(reason, "x"));
    await refreshSecurityQuotes([AAPL]);
    expect(prismaMock.securityQuote.update).toHaveBeenCalledWith({
      where: KEY,
      data: expect.objectContaining({ failureReason: reason, nextAttemptAt: new Date(NOW.getTime() + 24 * 3_600_000) })
    });
  });

  it("on a per-minute 429 marks the minute full, waits for the next minute and stops the pass", async () => {
    vi.mocked(fetchQuote).mockRejectedValue(new TwelveDataError("rate_limited", "429"));
    await refreshSecurityQuotes([AAPL, MSFT]);

    expect(markMinuteExhausted).toHaveBeenCalledWith(NOW);
    expect(fetchQuote).toHaveBeenCalledTimes(1);
    expect(prismaMock.securityQuote.update).toHaveBeenCalledWith({
      where: KEY,
      data: expect.objectContaining({ failureReason: "rate_limited", nextAttemptAt: new Date("2026-11-17T15:11:00Z") })
    });
  });

  it("on a daily 429 waits until 00:00 UTC and stops the pass", async () => {
    vi.mocked(fetchQuote).mockRejectedValue(new TwelveDataError("quota_exhausted", "429"));
    await refreshSecurityQuotes([AAPL, MSFT]);
    expect(fetchQuote).toHaveBeenCalledTimes(1);
    expect(markMinuteExhausted).not.toHaveBeenCalled();
    expect(prismaMock.securityQuote.update).toHaveBeenCalledWith({
      where: KEY,
      data: expect.objectContaining({ failureReason: "quota_exhausted", nextAttemptAt: new Date("2026-11-18T00:00:00Z") })
    });
  });

  it("rejects a quote in another currency than the holding's, without storing the price", async () => {
    vi.mocked(fetchQuote).mockResolvedValue({ ...quote, currency: "MXN" });
    await refreshSecurityQuotes([AAPL]);

    const { data } = vi.mocked(prismaMock.securityQuote.update).mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({ failureReason: "currency_mismatch" });
    expect(data).not.toHaveProperty("price");
  });

  it("continues with the next listing after a per-listing failure", async () => {
    vi.mocked(fetchQuote).mockRejectedValueOnce(new TwelveDataError("plan_restricted", "x")).mockResolvedValueOnce(quote);
    await refreshSecurityQuotes([AAPL, MSFT]);
    expect(fetchQuote).toHaveBeenCalledTimes(2);
  });
});
