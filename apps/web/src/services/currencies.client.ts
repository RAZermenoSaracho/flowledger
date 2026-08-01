import { apiRequest } from "./api";
import type { Currency } from "../types/api";

export function listCurrencies() {
  return apiRequest<{ currencies: Currency[]; fiat: Currency[]; crypto: Currency[] }>(
    "/currencies"
  );
}

export function getExchangeRate(from: string, to: string) {
  return apiRequest<{ from: string; to: string; rate: number }>(
    "/currencies/rate",
    { query: { from, to } }
  );
}
