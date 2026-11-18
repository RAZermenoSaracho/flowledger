import { env } from "../../../../config/env.js";
import type { TwelveDataFailureReason, TwelveDataQuote, TwelveDataSymbol } from "./types/twelveData.types.js";

const BASE_URL = "https://api.twelvedata.com";
const TIMEOUT_MS = 5000;
const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

/** A provider failure mapped to a stored failure reason. Its message never contains the API key. */
export class TwelveDataError extends Error {
  constructor(
    readonly reason: TwelveDataFailureReason,
    message: string
  ) {
    super(message);
    this.name = "TwelveDataError";
  }
}

function reasonForStatus(status: number, message: string): TwelveDataFailureReason {
  if (status === 429) return /\b(day|daily)\b/i.test(message) ? "quota_exhausted" : "rate_limited";
  // Basic answers a listing outside the plan (e.g. XMEX) with 404 "available starting with the Pro or Venture plan".
  if (status === 403 || /\bplan\b|upgrad/i.test(message)) return "plan_restricted";
  if (status === 404 || status === 400) return "not_found";
  return "unavailable";
}

/**
 * Calls a Twelve Data endpoint with the key in the `Authorization` header and a 5 s timeout, and returns the parsed JSON body.
 * Errors arrive as an HTTP error or as a `{ code, message, status: "error" }` body with HTTP 200; both throw a {@link TwelveDataError}.
 */
async function request(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  if (!env.TWELVE_DATA_API_KEY) throw new TwelveDataError("unavailable", "Twelve Data is not configured");
  const url = `${BASE_URL}${path}?${new URLSearchParams(params).toString()}`;

  let response: Response;
  let body: Record<string, unknown> | null = null;
  try {
    response = await fetch(url, {
      headers: { Authorization: `apikey ${env.TWELVE_DATA_API_KEY}` },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  } catch {
    throw new TwelveDataError("unavailable", "Twelve Data request failed or timed out");
  }

  const errorBody = body?.status === "error";
  if (!response.ok || errorBody) {
    const status = errorBody && typeof body?.code === "number" ? body.code : response.status;
    const message = typeof body?.message === "string" ? body.message : "";
    throw new TwelveDataError(reasonForStatus(status, message), `Twelve Data responded with ${status}`);
  }
  if (!body) throw new TwelveDataError("unavailable", "Twelve Data returned an unreadable body");
  return body;
}

/** Searches symbols matching `q` (up to 30 entries); entries missing a symbol, MIC or type are skipped. */
export async function searchSymbols(q: string): Promise<TwelveDataSymbol[]> {
  const body = await request("/symbol_search", { symbol: q, outputsize: "30" });
  if (!Array.isArray(body.data)) throw new TwelveDataError("unavailable", "Twelve Data returned an unexpected search body");
  return (body.data as Partial<TwelveDataSymbol>[]).filter(
    (item): item is TwelveDataSymbol =>
      typeof item.symbol === "string" &&
      typeof item.mic_code === "string" &&
      typeof item.instrument_type === "string" &&
      typeof item.currency === "string"
  );
}

/**
 * Fetches the latest quote of one listing. The price stays a decimal string; `quotedAt` is `last_quote_at`, else `timestamp`
 * (unix seconds). A missing, non-positive or non-decimal `close`, a missing currency or an unreadable time is `invalid_quote`.
 */
export async function fetchQuote(symbol: string, micCode: string): Promise<TwelveDataQuote> {
  const body = await request("/quote", { symbol, mic_code: micCode });
  const close = typeof body.close === "string" ? body.close : typeof body.close === "number" ? String(body.close) : "";
  const seconds = Number(body.last_quote_at ?? body.timestamp);
  if (!DECIMAL_PATTERN.test(close) || Number(close) <= 0 || typeof body.currency !== "string" || !body.currency || !Number.isFinite(seconds) || seconds <= 0) {
    throw new TwelveDataError("invalid_quote", "Twelve Data returned an unusable quote");
  }
  return { price: close, currency: body.currency, quotedAt: new Date(seconds * 1000), marketOpen: body.is_market_open === true };
}
