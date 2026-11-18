import { describe, expect, it } from "vitest";
import { isQuoteStale } from "../isQuoteStale.js";

const at = (iso: string) => new Date(iso);
const base = { failedAt: null, checkedAt: at("2026-11-17T15:00:00Z"), quotedAt: at("2026-11-17T14:59:00Z"), marketOpen: true };

describe("isQuoteStale", () => {
  it("is fresh for a recent quote from an open market", () => {
    expect(isQuoteStale(base, 60)).toBe(false);
  });

  it("is stale when the latest attempt failed after the last success", () => {
    expect(isQuoteStale({ ...base, failedAt: at("2026-11-17T16:00:00Z") }, 60)).toBe(true);
  });

  it("is stale when a failure exists and no success ever happened", () => {
    expect(isQuoteStale({ failedAt: at("2026-11-17T16:00:00Z"), checkedAt: null, quotedAt: null, marketOpen: null }, 60)).toBe(true);
  });

  it("ignores a failure older than the last success", () => {
    expect(isQuoteStale({ ...base, failedAt: at("2026-11-17T12:00:00Z") }, 60)).toBe(false);
  });

  it("is stale when an open market returned a quote older than twice the refresh interval", () => {
    expect(isQuoteStale({ ...base, quotedAt: at("2026-11-17T12:00:00Z") }, 60)).toBe(true);
    expect(isQuoteStale({ ...base, quotedAt: at("2026-11-17T13:00:00Z") }, 60)).toBe(false);
  });

  it("does not mark a closing price stale while the market is closed", () => {
    expect(isQuoteStale({ ...base, marketOpen: false, quotedAt: at("2026-11-14T21:00:00Z") }, 60)).toBe(false);
  });

  it("never marks a quote stale by elapsed time alone", () => {
    expect(isQuoteStale({ failedAt: null, checkedAt: null, quotedAt: null, marketOpen: null }, 60)).toBe(false);
  });
});
