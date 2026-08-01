import type { Prisma } from "@prisma/client";

export function moneyText(amount: Prisma.Decimal | number) {
  const value = typeof amount === "number" ? amount : amount.toNumber();
  return `$${value.toFixed(2)}`;
}
