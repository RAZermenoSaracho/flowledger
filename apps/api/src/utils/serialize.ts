import { Prisma } from "@prisma/client";

/** Keys whose `Decimal` values are native amounts and must serialize as exact decimal strings. */
const NATIVE_AMOUNT_KEYS = new Set([
  "amount",
  "accountAmount",
  "debtorAccountAmount",
  "destinationAmount",
  "feeAmount",
  "initialBalance",
  "currentBalance"
]);

// `Prisma.Decimal` defines its own `toJSON()` (returning a string), and per
// the JSON.stringify spec `toJSON()` runs *before* a replacer function ever
// sees the value, so Decimals have to be converted in a separate pass over the
// plain object tree first; anything else that defines its own `toJSON` (Date,
// Buffer, etc.) is left alone so JSON.stringify serializes it exactly as normal.
function convertDecimals(value: unknown, key?: string): unknown {
  if (value instanceof Prisma.Decimal) {
    return key !== undefined && NATIVE_AMOUNT_KEYS.has(key)
      ? value.toFixed()
      : value.toNumber();
  }

  if (Array.isArray(value)) {
    return value.map((item) => convertDecimals(item, key));
  }

  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { toJSON?: unknown }).toJSON !== "function"
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nested]) => [
        nestedKey,
        convertDecimals(nested, nestedKey)
      ])
    );
  }

  return value;
}

/** Deep-clones `value` for a response: a `Decimal` under a `NATIVE_AMOUNT_KEYS` key becomes an exact decimal string; every other `Decimal` becomes a `number`. */
export function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(convertDecimals(value))) as T;
}

/** Strips `passwordHash` off a user record before it's sent to a client. */
export function publicUser<T extends { passwordHash?: string | null }>(user: T) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}
