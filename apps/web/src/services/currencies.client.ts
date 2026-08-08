import { apiRequest } from "./api.client";
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
