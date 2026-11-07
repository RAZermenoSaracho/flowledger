import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../../config/env.js";

const REFRESH_TOKEN_BYTES = 48;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SESSION_REFRESH_TOKEN_TTL_MS = MS_PER_DAY;
const ACCESS_TOKEN_AUDIENCE = "flowledger-access";

/** Signs a short-lived access JWT for `user`, using their id as `sub` and embedding their email. */
export function signAccessToken(user: { id: string; email: string }) {
  const options: jwt.SignOptions = {
    subject: user.id,
    audience: ACCESS_TOKEN_AUDIENCE,
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]
  };

  return jwt.sign({ email: user.email }, env.JWT_SECRET, options);
}

/**
 * Verifies an access JWT's signature, expiry, audience and algorithm, and returns its user.
 * Tokens for other purposes share `JWT_SECRET`, and Prisma drops `undefined` from a `where`,
 * so a missing or non-string subject has to be rejected here rather than reach a query.
 * @throws if the token is invalid or its claims are malformed.
 */
export function verifyAccessToken(token: string) {
  const payload = jwt.verify(token, env.JWT_SECRET, {
    audience: ACCESS_TOKEN_AUDIENCE,
    algorithms: ["HS256"]
  }) as jwt.JwtPayload;

  if (typeof payload.sub !== "string" || !payload.sub || typeof payload.email !== "string") {
    throw new Error("Invalid access token claims");
  }

  return { id: payload.sub, email: payload.email };
}

/** Generates a high-entropy opaque refresh token value, its SHA-256 hash for storage, and its expiry: `REFRESH_TOKEN_EXPIRES_IN_DAYS` when `persistent`, else 24 hours. */
export function generateRefreshToken(persistent: boolean) {
  const token = randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
  const lifetimeMs = persistent
    ? env.REFRESH_TOKEN_EXPIRES_IN_DAYS * MS_PER_DAY
    : SESSION_REFRESH_TOKEN_TTL_MS;
  const expiresAt = new Date(Date.now() + lifetimeMs);

  return { token, tokenHash: hashRefreshToken(token), expiresAt };
}

/** Hashes a refresh token value for storage/lookup; refresh tokens are high-entropy opaque values, so a fast deterministic hash (not bcrypt) is appropriate. */
export function hashRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
