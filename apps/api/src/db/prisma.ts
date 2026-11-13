import { Prisma, PrismaClient } from "@prisma/client";

// decimal.js defaults to 20 significant digits, which silently rounds a 20-integer-digit + 18-decimal
// sum (columns are Decimal(38,18)); 50 keeps arithmetic on those values exact.
Prisma.Decimal.set({ precision: 50, rounding: Prisma.Decimal.ROUND_HALF_UP });

/** Shared Prisma client instance; import this everywhere instead of constructing a new one. */
export const prisma = new PrismaClient();
