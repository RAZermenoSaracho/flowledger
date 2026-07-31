type FiatCurrency = { code: string; name: string; type: "fiat" };

type FiatCache = {
  data: FiatCurrency[];
  fetchedAt: number;
};

const TTL_MS = 24 * 60 * 60 * 1000;
const RATE_TTL_MS = 5 * 60 * 1000;

let cache: FiatCache | null = null;
const rateCache = new Map<string, { rate: number; fetchedAt: number }>();

export async function getFiatCurrencies(): Promise<FiatCurrency[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) {
    return cache.data;
  }

  try {
    const response = await fetch("https://api.frankfurter.app/currencies");
    if (!response.ok) {
      throw new Error(`Frankfurter responded with ${response.status}`);
    }
    const raw = (await response.json()) as Record<string, string>;
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

export async function isFiatCurrencyCode(code: string): Promise<boolean> {
  if (code === "USD") return true;
  const currencies = await getFiatCurrencies();
  return currencies.some((currency) => currency.code === code);
}

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

  const response = await fetch(
    `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  );
  if (!response.ok) {
    throw new Error(
      `Frankfurter exchange rate lookup failed with ${response.status}`
    );
  }

  const data = (await response.json()) as { rates?: Record<string, number> };
  const rate = data.rates?.[to];
  if (typeof rate !== "number" || !Number.isFinite(rate)) {
    throw new Error(`Frankfurter did not return a rate for ${from} -> ${to}`);
  }

  rateCache.set(cacheKey, { rate, fetchedAt: now });
  return rate;
}
