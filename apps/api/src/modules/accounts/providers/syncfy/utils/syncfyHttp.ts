import type { Prisma } from "@prisma/client";
import { env } from "../../../../../config/env.js";
import { HttpError } from "../../../../../utils/httpError.js";
import type { JsonRecord } from "../types/syncfy.types.js";

const syncfyApiBaseUrl = env.SYNCFY_API_BASE_URL;
const syncfyDataBaseUrl = env.SYNCFY_DATA_BASE_URL;

/** Narrows an unknown value to a plain JSON object (excluding arrays), or `undefined` if it isn't one. */
export function getJsonObject(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

/** Narrows an unknown value to a non-empty string, or `undefined` otherwise. */
export function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Narrows an unknown value to a finite number, coercing a non-blank numeric string, or `undefined` otherwise. */
export function getNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

/** Reads the first present string value among `keys` on `record`; throws a 502 (upstream contract violation) if none are present. */
export function requiredString(
  record: JsonRecord,
  keys: string[],
  fieldName: string
) {
  for (const key of keys) {
    const value = getString(record[key]);
    if (value) return value;
  }

  throw new HttpError(502, `Syncfy payload is missing ${fieldName}`);
}

/** Reads the first present numeric value among `keys` on `record`; throws a 502 (upstream contract violation) if none are present. */
export function requiredNumber(
  record: JsonRecord,
  keys: string[],
  fieldName: string
) {
  for (const key of keys) {
    const value = getNumber(record[key]);
    if (value !== undefined) return value;
  }

  throw new HttpError(502, `Syncfy payload is missing ${fieldName}`);
}

/** Drops `undefined` entries and de-duplicates the remaining strings, preserving first-seen order. */
export function uniqueStrings(values: (string | undefined)[]) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value)))
  );
}

/** Parses a Unix timestamp (seconds or milliseconds, detected by magnitude) into a `Date`; throws a 502 if missing or invalid. */
export function unixTimestampToDate(value: unknown, fieldName: string) {
  const timestamp = getNumber(value);

  if (timestamp === undefined) {
    throw new HttpError(502, `Syncfy payload is missing ${fieldName}`);
  }

  const milliseconds =
    timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;

  const date = new Date(milliseconds);

  if (Number.isNaN(date.getTime())) {
    throw new HttpError(502, `Syncfy payload has invalid ${fieldName}`);
  }

  return date;
}

/** Extracts an auth token from a Syncfy response body, checking both the top level and a nested `response` object (Syncfy's shape is inconsistent across endpoints). */
export function extractSyncfyToken(responseBody: unknown) {
  const body = getJsonObject(responseBody);
  const response = getJsonObject(body?.response);
  return getString(body?.token ?? response?.token);
}

/** Extracts a list from a Syncfy response body, checking every shape Syncfy is known to return it in (bare array, `response` array, or `key` nested under either level). */
export function extractSyncfyList(responseBody: unknown, key: string): unknown[] {
  if (Array.isArray(responseBody)) return responseBody;

  const body = getJsonObject(responseBody);
  const response = body?.response;

  if (Array.isArray(response)) return response;

  const responseObject = getJsonObject(response);

  if (Array.isArray(responseObject?.[key])) return responseObject[key];
  if (Array.isArray(body?.[key])) return body[key];

  return [];
}

/** Extracts the user object from a Syncfy response body, preferring a nested `response` object over the top level. */
export function extractSyncfyUser(responseBody: unknown): unknown {
  const body = getJsonObject(responseBody);
  const response = getJsonObject(body?.response);

  return response ?? body ?? responseBody;
}

/** Builds an authenticated Syncfy API URL, appending the configured API key; throws if no key is configured. */
export function buildSyncfyApiUrl(pathname: string) {
  if (!env.SYNCFY_API_KEY) {
    throw new HttpError(500, "Syncfy API key is not configured");
  }

  const url = new URL(pathname, syncfyApiBaseUrl);
  url.searchParams.set("api_key", env.SYNCFY_API_KEY);

  return url;
}

/** Builds a Syncfy data-API URL with the sync token attached; throws if `endpoint` resolves outside the configured Syncfy host (rejects a malicious/malformed endpoint before it's ever fetched). */
export function buildSyncfyDataUrl(endpoint: string, token: string) {
  const url = new URL(endpoint, syncfyDataBaseUrl);

  if (url.origin !== syncfyDataBaseUrl) {
    throw new HttpError(400, "Unexpected Syncfy endpoint host");
  }

  url.searchParams.set("token", token);

  return url;
}

/** Strips credential/token/PII query params from a Syncfy endpoint before it's persisted (e.g. as sync-attempt metadata) — see root CLAUDE.md's "no bank credentials stored" rule. */
export function sanitizeSyncfyDataEndpoint(endpoint: string) {
  const url = new URL(endpoint, syncfyDataBaseUrl);

  if (url.origin !== syncfyDataBaseUrl) {
    throw new HttpError(400, "Unexpected Syncfy endpoint host");
  }

  const sensitiveParams = [
    "token",
    "api_key",
    "username",
    "password",
    "pass",
    "otp",
    "twofa",
    "security_answer",
    "card_number",
    "cvv",
    "pin"
  ];

  for (const param of sensitiveParams) {
    url.searchParams.delete(param);
  }

  return `${url.pathname}${url.search}`;
}

/** Fetches `url` and parses the response as JSON (`null` if the body isn't valid JSON); throws a 502 on a non-OK HTTP status. */
export async function fetchJson(url: URL, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    console.error("[SYNCFY REQUEST FAILED]", {
      pathname: url.pathname,
      status: response.status
    });

    throw new HttpError(
      502,
      `Syncfy request failed with status ${response.status}`
    );
  }

  return body;
}

/** Round-trips a value through JSON to strip `undefined`/non-serializable fields, producing a value Prisma's `Json` columns accept. */
export function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

/** Resolves after `ms` milliseconds (no-op for `ms <= 0`) — used to pace retries against Syncfy. */
export function wait(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Rejects with a 504 if `promise` doesn't settle within `timeoutMs`; otherwise resolves/rejects with `promise`'s own outcome. */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new HttpError(504, "Syncfy resync timed out"));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}
