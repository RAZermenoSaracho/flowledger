import { createHash } from "node:crypto";
import type { Request } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";

/** Client IP in the normalized form the limiter expects, so IPv6 addresses bucket by subnet. */
export function clientIpKey(req: Request) {
  return ipKeyGenerator(req.ip ?? "");
}

/**
 * Creates an in-memory limiter. By default it keys by the Bearer token's SHA-256 (so keys share one bucket) or, without a token, the client IP.
 *
 * @param keyGenerator replaces the default key.
 * @param message when set, a 429 responds with `{ message }`.
 * @param skipSuccessfulRequests when true, only failed requests count toward the limit.
 * @param skipInTests when true, the limiter is off under `NODE_ENV=test`, because route suites share one client address.
 */
export function createRateLimiter({
  windowMs,
  limit,
  keyGenerator,
  message,
  skipSuccessfulRequests = false,
  skipInTests = false
}: {
  windowMs: number;
  limit: number;
  keyGenerator?: (req: Request) => string;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipInTests?: boolean;
}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests,
    ...(message ? { message: { message } } : {}),
    ...(skipInTests ? { skip: () => env.NODE_ENV === "test" } : {}),
    keyGenerator:
      keyGenerator ??
      ((req) => {
        const header = req.header("authorization");
        if (header?.startsWith("Bearer ")) {
          return createHash("sha256").update(header.slice(7)).digest("hex");
        }
        return clientIpKey(req);
      })
  });
}
