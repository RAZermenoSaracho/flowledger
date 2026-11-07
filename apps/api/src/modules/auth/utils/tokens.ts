import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../../config/env.js";

const REFRESH_TOKEN_BYTES = 48;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SESSION_REFRESH_TOKEN_TTL_MS = MS_PER_DAY;

/** Signs a short-lived access JWT for `user`, using their id as `sub` and embedding their email. */
export function signAccessToken(user: { id: string; email: string }) {
  const options: jwt.SignOptions = {
    subject: user.id,
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]
  };

  return jwt.sign({ email: user.email }, env.JWT_SECRET, options);
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
