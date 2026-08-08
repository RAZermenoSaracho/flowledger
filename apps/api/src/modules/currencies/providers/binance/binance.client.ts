type TickerCache = {
  pricesBySymbol: Map<string, number>;
  fetchedAt: number;
};

const TICKER_TTL_MS = 60 * 1000;

let tickerCache: TickerCache | null = null;

/** Fetches Binance's full ticker price list, caching the result for {@link TICKER_TTL_MS}. */
export async function fetchBinanceTickerPrices(): Promise<Map<string, number>> {
  const now = Date.now();
  if (tickerCache && now - tickerCache.fetchedAt < TICKER_TTL_MS) {
    return tickerCache.pricesBySymbol;
  }

  const response = await fetch("https://api.binance.com/api/v3/ticker/price");
  if (!response.ok) {
    throw new Error(`Binance responded with ${response.status}`);
  }
  const raw = (await response.json()) as Array<{ symbol: string; price: string }>;
  const pricesBySymbol = new Map<string, number>();
  for (const { symbol, price } of raw) {
    const parsed = Number(price);
    if (Number.isFinite(parsed)) {
      pricesBySymbol.set(symbol, parsed);
    }
  }

  tickerCache = { pricesBySymbol, fetchedAt: now };
  return pricesBySymbol;
}
