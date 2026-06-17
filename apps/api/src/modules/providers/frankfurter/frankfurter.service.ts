type FiatCurrency = { code: string; name: string; type: "fiat" };

type FiatCache = {
  data: FiatCurrency[];
  fetchedAt: number;
};

const TTL_MS = 24 * 60 * 60 * 1000;

let cache: FiatCache | null = null;

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
