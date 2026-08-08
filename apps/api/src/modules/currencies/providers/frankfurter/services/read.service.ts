import {
  fetchFrankfurterCurrencies,
  fetchFrankfurterRate
} from "../frankfurter.client.js";

type FiatCurrency = { code: string; name: string; type: "fiat" };

type FiatCache = {
  data: FiatCurrency[];
  fetchedAt: number;
};

const TTL_MS = 24 * 60 * 60 * 1000;
const RATE_TTL_MS = 5 * 60 * 1000;

let cache: FiatCache | null = null;
const rateCache = new Map<string, { rate: number; fetchedAt: number }>();

/** Lists supported fiat currencies, cached for 24h; returns `[]` if Frankfurter is unreachable. */
export async function getFiatCurrencies(): Promise<FiatCurrency[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) {
    return cache.data;
  }

  try {
    const raw = await fetchFrankfurterCurrencies();
    const data: FiatCurrency[] = Object.entries(raw).map(([code, name]) => ({
      code,
      name,
      type: "fiat"
    }));
    cache = { data, fetchedAt: now };
    return data;
  } catch (err) {
    console.error("Failed to fetch fiat currencies from Frankfurter:", err);
    return [];
  }
}

/** Checks whether `code` is a known fiat currency (USD always counts). */
export async function isFiatCurrencyCode(code: string): Promise<boolean> {
  if (code === "USD") return true;
  const currencies = await getFiatCurrencies();
  return currencies.some((currency) => currency.code === code);
}

/** Resolves the live rate between two fiat currencies, caching each pair for 5 minutes. */
export async function getFiatExchangeRate(
  from: string,
  to: string
): Promise<number> {
  if (from === to) return 1;

  const cacheKey = `${from}:${to}`;
  const now = Date.now();
  const cached = rateCache.get(cacheKey);
  if (cached && now - cached.fetchedAt < RATE_TTL_MS) {
    return cached.rate;
  }

  const rate = await fetchFrankfurterRate(from, to);
  rateCache.set(cacheKey, { rate, fetchedAt: now });
  return rate;
}
