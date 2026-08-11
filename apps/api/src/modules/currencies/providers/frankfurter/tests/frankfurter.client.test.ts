import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchFrankfurterCurrencies,
  fetchFrankfurterRate
} from "../frankfurter.client.js";

describe("fetchFrankfurterCurrencies", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns the raw currency-code-to-name map", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ USD: "US Dollar", EUR: "Euro" })
    }) as never;

    await expect(fetchFrankfurterCurrencies()).resolves.toEqual({
      USD: "US Dollar",
      EUR: "Euro"
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.frankfurter.app/currencies"
    );
  });

  it("throws when the response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({})
    }) as never;

    await expect(fetchFrankfurterCurrencies()).rejects.toThrow(
      "Frankfurter responded with 500"
    );
  });
});

describe("fetchFrankfurterRate", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("requests the pair and returns the rate for 'to'", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ rates: { MXN: 17.5 } })
    }) as never;

    await expect(fetchFrankfurterRate("USD", "MXN")).resolves.toBe(17.5);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.frankfurter.app/latest?from=USD&to=MXN"
    );
  });

  it("URL-encodes the currency codes", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ rates: { "A B": 1 } })
    }) as never;

    await fetchFrankfurterRate("A B", "A B");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.frankfurter.app/latest?from=A%20B&to=A%20B"
    );
  });

  it("throws when the response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({})
    }) as never;

    await expect(fetchFrankfurterRate("USD", "MXN")).rejects.toThrow(
      "Frankfurter exchange rate lookup failed with 503"
    );
  });

  it("throws when the rate for 'to' is missing", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ rates: {} })
    }) as never;

    await expect(fetchFrankfurterRate("USD", "MXN")).rejects.toThrow(
      "Frankfurter did not return a rate for USD -> MXN"
    );
  });

  it("throws when the rate for 'to' is not a finite number", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ rates: { MXN: Number.NaN } })
    }) as never;

    await expect(fetchFrankfurterRate("USD", "MXN")).rejects.toThrow(
      "Frankfurter did not return a rate for USD -> MXN"
    );
  });
});
