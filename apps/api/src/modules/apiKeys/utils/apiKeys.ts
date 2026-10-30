import type { CredentialLifetime } from "@flowledger/shared";
import { createHash, randomBytes } from "node:crypto";

/** Prisma `select` for the secret-free API key fields; never includes `secretHash`. */
export const publicApiKeySelect = {
  id: true,
  name: true,
  hint: true,
  scopes: true,
  expiresAt: true,
  revokedAt: true,
  lastUsedAt: true,
  createdAt: true
} as const;

/** Hashes a full API key for storage/lookup; keys are 256-bit random, so a fast SHA-256 is appropriate. */
export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

/** Generates a new `fl_` key plus its display hint (first 8 chars) and storage hash. */
export function generateApiKey() {
  const key = `fl_${randomBytes(32).toString("base64url")}`;
  return { key, hint: key.slice(0, 8), secretHash: hashApiKey(key) };
}

/** Computes the expiry for `lifetime` from `now` in UTC calendar months/years, clamped to month end; `never` gives `null`. */
export function resolveExpiresAt(lifetime: CredentialLifetime, now: Date): Date | null {
  if (lifetime === "never") return null;
  if (lifetime === "1d") return new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const months = lifetime === "1m" ? 1 : 12;
  const target = new Date(now.getTime());
  const day = target.getUTCDate();
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}
