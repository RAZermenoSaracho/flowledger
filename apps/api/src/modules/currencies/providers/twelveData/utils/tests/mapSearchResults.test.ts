import { describe, expect, it } from "vitest";
import type { TwelveDataSymbol } from "../../types/twelveData.types.js";
import { mapSearchResults, securityTypeOf } from "../mapSearchResults.js";

const item = (extra: Partial<TwelveDataSymbol> = {}): TwelveDataSymbol => ({
  symbol: "AAPL",
  instrument_name: "Apple Inc.",
  exchange: "NASDAQ",
  mic_code: "XNGS",
  country: "United States",
  currency: "USD",
  instrument_type: "Common Stock",
  ...extra
});
const supported = new Set(["USD", "MXN"]);

describe("securityTypeOf", () => {
  it.each([
    ["ETF", "etf"],
    ["Common Stock", "stock"],
    ["Preferred Stock", "stock"],
    ["Depositary Receipt", "stock"],
    ["REIT", "stock"],
    ["American Depositary Receipt", "stock"],
    ["Global Depositary Receipt", "stock"],
    ["Unit", "stock"],
    ["Mutual Fund", null],
    ["Bond", null],
    ["Index", null]
  ])("maps %s to %s", (type, expected) => {
    expect(securityTypeOf(type)).toBe(expected);
  });
});

describe("mapSearchResults", () => {
  it("returns the same ticker on two exchanges as distinct entries", () => {
    const results = mapSearchResults([item(), item({ exchange: "BMV", mic_code: "XMEX", currency: "MXN" })], supported);
    expect(results.map((r) => `${r.symbol}:${r.micCode}:${r.currency}:${r.type}`)).toEqual(["AAPL:XNGS:USD:stock", "AAPL:XMEX:MXN:stock"]);
    expect(results[0]).toEqual({ symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", micCode: "XNGS", country: "United States", currency: "USD", type: "stock" });
  });

  it("drops other instrument types, unsupported currencies, bad tickers and duplicates", () => {
    const results = mapSearchResults(
      [
        item({ instrument_type: "Mutual Fund", symbol: "VFIAX" }),
        item({ symbol: "XYZ", currency: "XXX" }),
        item({ symbol: "bad ticker" }),
        item({ symbol: "SPY", instrument_type: "ETF" }),
        item({ symbol: "SPY", instrument_type: "ETF" })
      ],
      supported
    );
    expect(results.map((r) => [r.symbol, r.type])).toEqual([["SPY", "etf"]]);
  });
});
