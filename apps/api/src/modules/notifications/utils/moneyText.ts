import type { Prisma } from "@prisma/client";

/** Formats an amount as a `$`-prefixed 2-decimal string for notification messages. */
export function moneyText(amount: Prisma.Decimal | number) {
  const value = typeof amount === "number" ? amount : amount.toNumber();
  return `$${value.toFixed(2)}`;
}
