import type { Request } from "express";
import { clientIpKey, createRateLimiter } from "../../../utils/rateLimit.js";

const perUser = (req: Request) => req.user?.id ?? clientIpKey(req);

/** Username search calls per user, to bound enumeration. */
export const userSearchLimiter = createRateLimiter({
  windowMs: 60_000,
  limit: 30,
  keyGenerator: perUser,
  message: "Too many searches. Please try again later."
});

/** Username availability checks per user, to bound enumeration. */
export const usernameAvailabilityLimiter = createRateLimiter({
  windowMs: 60_000,
  limit: 30,
  keyGenerator: perUser,
  message: "Too many checks. Please try again later."
});
