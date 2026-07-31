type CryptoCurrency = { code: string; name: string; type: "crypto" };

type CryptoCache = {
  data: CryptoCurrency[];
  fetchedAt: number;
};

type TickerCache = {
  pricesBySymbol: Map<string, number>;
  fetchedAt: number;
};

const TTL_MS = 60 * 60 * 1000;
const TICKER_TTL_MS = 60 * 1000;

// Longer suffixes first to avoid partial matches (e.g. BUSD before BTC)
const QUOTE_ASSETS = ["USDT", "BUSD", "BNB", "BTC", "ETH"] as const;

let cache: CryptoCache | null = null;
let tickerCache: TickerCache | null = null;

function extractBaseAsset(symbol: string): string | null {
  for (const quote of QUOTE_ASSETS) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) {
      return symbol.slice(0, symbol.length - quote.length);
    }
  }
  return null;
}

async function getTickerPrices(): Promise<Map<string, number>> {
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

export async function getCryptoCurrencies(): Promise<CryptoCurrency[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) {
    return cache.data;
  }

  try {
    const pricesBySymbol = await getTickerPrices();
    const seen = new Set<string>();
    const data: CryptoCurrency[] = [];
    for (const symbol of pricesBySymbol.keys()) {
      const base = extractBaseAsset(symbol);
      if (base && !seen.has(base)) {
        seen.add(base);
        data.push({ code: base, name: base, type: "crypto" });
      }
    }
    cache = { data, fetchedAt: now };
    return data;
  } catch (err) {
    console.error("Failed to fetch crypto currencies from Binance:", err);
    return [];
  }
}

// Treats USDT as ~1 USD; returns null when no direct Binance quote exists.
export async function getCryptoUsdtPrice(code: string): Promise<number | null> {
  if (code === "USDT" || code === "USD") return 1;

  const pricesBySymbol = await getTickerPrices();
  const direct = pricesBySymbol.get(`${code}USDT`);
  if (direct !== undefined) return direct;

  const inverse = pricesBySymbol.get(`USDT${code}`);
  if (inverse !== undefined && inverse > 0) return 1 / inverse;

  return null;
}

export async function isCryptoCurrencyCode(code: string): Promise<boolean> {
  if (code === "USDT") return true;
  const currencies = await getCryptoCurrencies();
  return currencies.some((currency) => currency.code === code);
}
