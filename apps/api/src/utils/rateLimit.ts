import { createHash } from "node:crypto";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

/** Creates a limiter keyed by the Bearer token's SHA-256 (so keys share one bucket) or, without a token, the client IP. */
export function createRateLimiter({ windowMs, limit }: { windowMs: number; limit: number }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => {
      const header = req.header("authorization");
      if (header?.startsWith("Bearer ")) {
        return createHash("sha256").update(header.slice(7)).digest("hex");
      }
      return ipKeyGenerator(req.ip ?? "");
    }
  });
}
