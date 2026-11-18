import { apiRequest } from "./api.client";
import type { SecuritySearchResponse } from "@flowledger/shared";
import type { Currency } from "../types/currencies.types";

/** Fetches supported fiat and crypto currencies, both combined and grouped by type. */
export function listCurrencies() {
  return apiRequest<{
    currencies: Currency[];
    fiat: Currency[];
    crypto: Currency[];
  }>("/currencies");
}

/** Fetches the exchange rate between two currencies. */
export function getExchangeRate(from: string, to: string) {
  return apiRequest<{ from: string; to: string; rate: number }>(
    "/currencies/rate",
    { query: { from, to } }
  );
}

/** Searches stock and ETF listings by ticker or name (`q`, 1-20 chars); `available` is false when search is not configured or out of credits. `signal` aborts a superseded search. */
export function searchSecurities(q: string, signal?: AbortSignal) {
  return apiRequest<SecuritySearchResponse>("/currencies/securities", {
    query: { q },
    signal
  });
}
