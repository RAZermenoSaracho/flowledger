import type { SecuritySearchResult, SecurityType } from "@flowledger/shared";
import type { TwelveDataSymbol } from "../types/twelveData.types.js";

const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;
const STOCK_TYPES = new Set([
  "common stock",
  "preferred stock",
  "depositary receipt",
  "reit",
  "american depositary receipt",
  "global depositary receipt",
  "unit"
]);

/** Maps a provider instrument type to a holding kind: ETF to `etf`, equity types to `stock`, anything else to `null` (dropped). */
export function securityTypeOf(instrumentType: string): SecurityType | null {
  const type = instrumentType.trim().toLowerCase();
  if (type === "etf") return "etf";
  return STOCK_TYPES.has(type) ? "stock" : null;
}

/**
 * Keeps only equity and ETF listings whose ticker matches the holding ticker rule and whose currency is in `supportedCurrencies`,
 * maps them to search results and drops duplicate `(symbol, micCode)` pairs.
 */
export function mapSearchResults(items: TwelveDataSymbol[], supportedCurrencies: ReadonlySet<string>): SecuritySearchResult[] {
  const seen = new Set<string>();
  const results: SecuritySearchResult[] = [];
  for (const item of items) {
    const type = securityTypeOf(item.instrument_type);
    const symbol = item.symbol.trim().toUpperCase();
    const currency = item.currency.trim().toUpperCase();
    const micCode = item.mic_code.trim().toUpperCase();
    const key = `${symbol}:${micCode}`;
    if (!type || !TICKER_PATTERN.test(symbol) || !/^[A-Z0-9]{4}$/.test(micCode) || !supportedCurrencies.has(currency) || seen.has(key)) continue;
    seen.add(key);
    results.push({
      symbol,
      name: (item.instrument_name ?? "").slice(0, 80),
      exchange: item.exchange ?? micCode,
      micCode,
      country: item.country ?? "",
      currency,
      type
    });
  }
  return results;
}
