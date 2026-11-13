import { Prisma } from "@prisma/client";

/** Formats an amount exactly as `<amount> <CURRENCY>` for notification messages; digits are never rounded and never use exponent notation. */
export function moneyText(amount: Prisma.Decimal.Value, currency: string) {
  return `${new Prisma.Decimal(amount).toFixed()} ${currency.toUpperCase()}`;
}
