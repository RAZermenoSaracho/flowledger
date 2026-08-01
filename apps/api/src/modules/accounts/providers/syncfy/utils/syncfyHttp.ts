import type { Prisma } from "@prisma/client";
import { env } from "../../../../../config/env.js";
import { HttpError } from "../../../../../utils/httpError.js";
import type { JsonRecord } from "../types/syncfy.types.js";

const syncfyApiBaseUrl = env.SYNCFY_API_BASE_URL;
const syncfyDataBaseUrl = env.SYNCFY_DATA_BASE_URL;

export function getJsonObject(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

export function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function getNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

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

export function uniqueStrings(values: (string | undefined)[]) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value)))
  );
}

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

export function extractSyncfyToken(responseBody: unknown) {
  const body = getJsonObject(responseBody);
  const response = getJsonObject(body?.response);
  return getString(body?.token ?? response?.token);
}

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

export function extractSyncfyUser(responseBody: unknown): unknown {
  const body = getJsonObject(responseBody);
  const response = getJsonObject(body?.response);

  return response ?? body ?? responseBody;
}

export function buildSyncfyApiUrl(pathname: string) {
  if (!env.SYNCFY_API_KEY) {
    throw new HttpError(500, "Syncfy API key is not configured");
  }

  const url = new URL(pathname, syncfyApiBaseUrl);
  url.searchParams.set("api_key", env.SYNCFY_API_KEY);

  return url;
}

export function buildSyncfyDataUrl(endpoint: string, token: string) {
  const url = new URL(endpoint, syncfyDataBaseUrl);

  if (url.origin !== syncfyDataBaseUrl) {
    throw new HttpError(400, "Unexpected Syncfy endpoint host");
  }

  url.searchParams.set("token", token);

  return url;
}

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

export function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export function wait(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

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
