import { badRequest } from "./httpError.js";

/**
 * Decodes a raw `query` request param (a JSON object holding `where`/`sort`/`pagination`).
 *
 * @param raw - The raw query-string value; falsy yields `{}`.
 * @param label - Names the resource in the 400 message, e.g. `"groups"` gives `Invalid groups query: ...`; defaults to `"query"`.
 * @throws 400 when `raw` is not valid JSON or does not decode to a plain object.
 */
export function parseQueryParam<T extends object = Record<string, unknown>>(
  raw: string | undefined,
  label?: string
): T {
  if (!raw) return {} as T;

  const prefix = label ? `Invalid ${label} query` : "Invalid query";
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw badRequest(`${prefix}: not valid JSON`);
  }
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
    throw badRequest(`${prefix}: must be a JSON object`);
  }
  return decoded as T;
}
