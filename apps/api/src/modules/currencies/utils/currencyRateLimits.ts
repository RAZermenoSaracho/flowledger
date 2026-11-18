import type { Request } from "express";
import { clientIpKey, createRateLimiter } from "../../../utils/rateLimit.js";

/** Security search calls per user (30 per minute), because each uncached search spends a provider credit. */
export const securitySearchLimiter = createRateLimiter({
  windowMs: 60_000,
  limit: 30,
  keyGenerator: (req: Request) => req.user?.id ?? clientIpKey(req),
  message: "Too many searches. Please try again later."
});
