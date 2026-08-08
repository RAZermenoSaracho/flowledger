import { Prisma } from "@prisma/client";

/** Deep-clones `value` through JSON, converting any Prisma `Decimal` to a plain `number` so it serializes correctly. */
export function serialize<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, nestedValue: unknown) => {
      if (nestedValue instanceof Prisma.Decimal) {
        return nestedValue.toNumber();
      }

      return nestedValue;
    })
  ) as T;
}

/** Strips `passwordHash` off a user record before it's sent to a client. */
export function publicUser<T extends { passwordHash?: string | null }>(user: T) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}
