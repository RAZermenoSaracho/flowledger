import type { SecuritySearchResponse } from "@flowledger/shared";
import { env } from "../../../../../config/env.js";
import { getFiatCurrencies } from "../../frankfurter/services/read.service.js";
import { searchSymbols, TwelveDataError } from "../twelveData.client.js";
import { mapSearchResults } from "../utils/mapSearchResults.js";
import { markMinuteExhausted, reserveCredits } from "./credits.service.js";

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const UNAVAILABLE: SecuritySearchResponse = { available: false, results: [] };

const cache = new Map<string, { response: SecuritySearchResponse; expiresAt: number }>();

/** Empties the in-memory search cache. */
export function clearSecuritySearchCache(): void {
  cache.clear();
}

/**
 * Searches stock and ETF listings through Twelve Data. Results are cached in memory per normalized query (1 h, 500 entries, oldest
 * evicted); an uncached search reserves one credit from the shared budget. Returns `available: false` with no results without a
 * key, when the budget is spent or when the provider fails, and never throws for those cases. Unavailable answers are not cached.
 */
export async function searchSecurities(q: string, now = Date.now()): Promise<SecuritySearchResponse> {
  if (!env.TWELVE_DATA_API_KEY) return UNAVAILABLE;
  const key = q.trim().toUpperCase();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.response;

  if ((await reserveCredits(1, new Date(now))) !== "reserved") return UNAVAILABLE;
  try {
    const items = await searchSymbols(q.trim());
    const supported = new Set((await getFiatCurrencies()).map((currency) => currency.code));
    supported.add("USD");
    const response: SecuritySearchResponse = { available: true, results: mapSearchResults(items, supported) };
    if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(key, { response, expiresAt: now + CACHE_TTL_MS });
    return response;
  } catch (error) {
    if (!(error instanceof TwelveDataError)) throw error;
    if (error.reason === "rate_limited") await markMinuteExhausted(new Date(now));
    return UNAVAILABLE;
  }
}
