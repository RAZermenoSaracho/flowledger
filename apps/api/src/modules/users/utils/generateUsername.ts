import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";

const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
const maxAttempts = 5;

/** Generates a random `user_` + 12 character username. Never derived from email or name, so it leaks nothing and is not a credential. */
export function generateUsername(): string {
  let suffix = "";
  for (let i = 0; i < 12; i += 1) suffix += alphabet[randomInt(alphabet.length)];
  return `user_${suffix}`;
}

/** True when `error` is a unique violation on `User.username`. */
export function isUsernameConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const target = error.meta?.target;
  return Array.isArray(target) ? target.includes("username") : String(target ?? "").includes("username");
}

/**
 * Runs `create` with a freshly generated username, retrying with a new one when the value collides.
 * Wrap a whole transaction rather than a statement inside one: a unique violation aborts the Postgres transaction.
 */
export async function withGeneratedUsername<T>(create: (username: string) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await create(generateUsername());
    } catch (error) {
      if (attempt >= maxAttempts || !isUsernameConflict(error)) throw error;
    }
  }
}
