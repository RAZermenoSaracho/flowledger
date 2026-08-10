import { fetchBinanceTickerPrices } from "../binance.client.js";
import { extractBaseAsset } from "../utils/extractBaseAsset.js";

type CryptoCurrency = { code: string; name: string; type: "crypto" };

type CryptoCache = {
  data: CryptoCurrency[];
  fetchedAt: number;
};

const TTL_MS = 60 * 60 * 1000;

let cache: CryptoCache | null = null;

/** Lists supported crypto currencies, derived from Binance ticker symbols and cached for an hour; returns `[]` if Binance is unreachable. */
export async function getCryptoCurrencies(): Promise<CryptoCurrency[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) {
    return cache.data;
  }

  try {
    const pricesBySymbol = await fetchBinanceTickerPrices();
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

/** Resolves a crypto asset's USDT price via Binance, trying both `{code}USDT` and inverse `USDT{code}` symbols; treats USDT/USD as 1 and returns `null` if no quote exists. */
export async function getCryptoUsdtPrice(code: string): Promise<number | null> {
  if (code === "USDT" || code === "USD") return 1;

  const pricesBySymbol = await fetchBinanceTickerPrices();
  const direct = pricesBySymbol.get(`${code}USDT`);
  if (direct !== undefined) return direct;

  const inverse = pricesBySymbol.get(`USDT${code}`);
  if (inverse !== undefined && inverse > 0) return 1 / inverse;

  return null;
}

/** Checks whether `code` is a known crypto currency (USDT always counts). */
export async function isCryptoCurrencyCode(code: string): Promise<boolean> {
  if (code === "USDT") return true;
  const currencies = await getCryptoCurrencies();
  return currencies.some((currency) => currency.code === code);
}
