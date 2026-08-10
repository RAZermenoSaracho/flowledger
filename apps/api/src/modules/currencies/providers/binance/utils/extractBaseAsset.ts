// Longer suffixes first to avoid partial matches (e.g. BUSD before BTC)
const QUOTE_ASSETS = ["USDT", "BUSD", "BNB", "BTC", "ETH"] as const;

/** Strips a known quote-asset suffix (checked longest-first, e.g. `BUSD` before `BTC`) off a Binance trading symbol; returns `null` if none matches. */
export function extractBaseAsset(symbol: string): string | null {
  for (const quote of QUOTE_ASSETS) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) {
      return symbol.slice(0, symbol.length - quote.length);
    }
  }
  return null;
}
