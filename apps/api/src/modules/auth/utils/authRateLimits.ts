import { createHash } from "node:crypto";
import type { Request } from "express";
import { clientIpKey, createRateLimiter } from "../../../utils/rateLimit.js";

const MINUTE_MS = 60 * 1000;
const tooManyAttempts = "Too many attempts. Please try again later.";

function loginPairKey(req: Request) {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  return `${clientIpKey(req)}:${createHash("sha256").update(email).digest("hex")}`;
}

function limiter(windowMs: number, limit: number, keyGenerator?: (req: Request) => string) {
  return createRateLimiter({
    windowMs,
    limit,
    keyGenerator,
    message: tooManyAttempts,
    skipInTests: true
  });
}

/**
 * Failed logins per client address and email. Keying on the pair stops one source guessing
 * one account without letting that source lock the account for everyone else.
 */
export const loginFailureLimiter = createRateLimiter({
  windowMs: 15 * MINUTE_MS,
  limit: 10,
  keyGenerator: loginPairKey,
  message: tooManyAttempts,
  skipSuccessfulRequests: true,
  skipInTests: true
});

/** All login attempts per client address. */
export const loginAddressLimiter = limiter(15 * MINUTE_MS, 50, clientIpKey);

/** Registrations per client address. */
export const registerLimiter = limiter(60 * MINUTE_MS, 10, clientIpKey);

/** Session refreshes per client address. */
export const refreshLimiter = limiter(MINUTE_MS, 60, clientIpKey);

/** Password and email changes per user, so minting new access tokens doesn't buy more password guesses. */
export const credentialChangeLimiter = limiter(15 * MINUTE_MS, 10, (req) => req.user?.id ?? clientIpKey(req));
