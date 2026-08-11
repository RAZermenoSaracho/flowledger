import { Prisma } from "@prisma/client";

// `Prisma.Decimal` defines its own `toJSON()` (returning a string), and per
// the JSON.stringify spec `toJSON()` runs *before* a replacer function ever
// sees the value — so a JSON.stringify replacer alone can never intercept a
// Decimal (it would only ever see the already-stringified result). Decimals
// have to be converted to numbers in a separate pass over the plain object
// tree first; anything else that defines its own `toJSON` (Date, Buffer,
// etc.) is left alone so JSON.stringify serializes it exactly as normal.
function convertDecimalsToNumbers(value: unknown): unknown {
  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }

  if (Array.isArray(value)) {
    return value.map(convertDecimalsToNumbers);
  }

  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { toJSON?: unknown }).toJSON !== "function"
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        convertDecimalsToNumbers(nested)
      ])
    );
  }

  return value;
}

/** Deep-clones `value`, converting any Prisma `Decimal` to a plain `number` so it serializes correctly. */
export function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(convertDecimalsToNumbers(value))) as T;
}

/** Strips `passwordHash` off a user record before it's sent to a client. */
export function publicUser<T extends { passwordHash?: string | null }>(user: T) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}
