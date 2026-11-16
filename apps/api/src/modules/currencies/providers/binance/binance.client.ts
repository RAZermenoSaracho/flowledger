type TickerCache = {
  pricesBySymbol: Map<string, number>;
  fetchedAt: number;
};

const TICKER_TTL_MS = 60 * 1000;

let tickerCache: TickerCache | null = null;
// After a failed refresh, the last known list is served without retrying until this time, so an outage costs one request per TTL.
let retryAfter = 0;

/** When the cached ticker list was last fetched successfully, or `null` if it never was. */
export function getBinanceTickerFetchedAt(): Date | null {
  return tickerCache ? new Date(tickerCache.fetchedAt) : null;
}

/**
 * Fetches Binance's full ticker price list, caching the result for {@link TICKER_TTL_MS}.
 * When a refresh fails and an earlier list exists, that last known list is returned with its original `fetchedAt`
 * (and no retry is attempted for one TTL); it throws only when no list was ever fetched. The list never expires on its own.
 */
export async function fetchBinanceTickerPrices(): Promise<Map<string, number>> {
  const now = Date.now();
  if (tickerCache && (now - tickerCache.fetchedAt < TICKER_TTL_MS || now < retryAfter)) {
    return tickerCache.pricesBySymbol;
  }

  let raw: Array<{ symbol: string; price: string }>;
  try {
    const response = await fetch("https://api.binance.com/api/v3/ticker/price");
    if (!response.ok) {
      throw new Error(`Binance responded with ${response.status}`);
    }
    raw = (await response.json()) as Array<{ symbol: string; price: string }>;
  } catch (error) {
    if (tickerCache) {
      retryAfter = now + TICKER_TTL_MS;
      return tickerCache.pricesBySymbol;
    }
    throw error;
  }
  const pricesBySymbol = new Map<string, number>();
  for (const { symbol, price } of raw) {
    const parsed = Number(price);
    if (Number.isFinite(parsed)) {
      pricesBySymbol.set(symbol, parsed);
    }
  }

  tickerCache = { pricesBySymbol, fetchedAt: now };
  retryAfter = 0;
  return pricesBySymbol;
}
