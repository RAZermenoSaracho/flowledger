import { Prisma } from "@prisma/client";

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

export function publicUser<T extends { passwordHash?: string | null }>(user: T) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}
