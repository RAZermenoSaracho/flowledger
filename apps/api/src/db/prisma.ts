import { PrismaClient } from "@prisma/client";

/** Shared Prisma client instance; import this everywhere instead of constructing a new one. */
export const prisma = new PrismaClient();
