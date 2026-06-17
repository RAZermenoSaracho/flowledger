type CryptoCurrency = { code: string; name: string; type: "crypto" };

type CryptoCache = {
  data: CryptoCurrency[];
  fetchedAt: number;
};

const TTL_MS = 60 * 60 * 1000;

// Longer suffixes first to avoid partial matches (e.g. BUSD before BTC)
const QUOTE_ASSETS = ["USDT", "BUSD", "BNB", "BTC", "ETH"] as const;

let cache: CryptoCache | null = null;

function extractBaseAsset(symbol: string): string | null {
  for (const quote of QUOTE_ASSETS) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) {
      return symbol.slice(0, symbol.length - quote.length);
    }
  }
  return null;
}

export async function getCryptoCurrencies(): Promise<CryptoCurrency[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) {
    return cache.data;
  }

  try {
    const response = await fetch("https://api.binance.com/api/v3/ticker/price");
    if (!response.ok) {
      throw new Error(`Binance responded with ${response.status}`);
    }
    const raw = (await response.json()) as Array<{ symbol: string; price: string }>;
    const seen = new Set<string>();
    const data: CryptoCurrency[] = [];
    for (const { symbol } of raw) {
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
