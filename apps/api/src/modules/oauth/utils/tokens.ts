import { randomBytes } from "node:crypto";
import { env } from "../../../config/env.js";
import { hashApiKey } from "../../apiKeys/utils/apiKeys.js";

/** Access tokens live at most this long, and never past the grant. */
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
/** Authorization codes are single-use and valid this long. */
export const CODE_TTL_MS = 60 * 1000;
/** A previous refresh token re-presented within this window of its rotation is treated as a retry. */
export const REFRESH_GRACE_MS = 30 * 1000;

/** SHA-256 hex of a token or code; all three are 256-bit random, so a fast hash is appropriate. */
export const hashToken = hashApiKey;

/** The authorization-server issuer: `PUBLIC_API_URL` without a trailing slash; used verbatim in metadata and `iss`. */
export const issuerUrl = () => env.PUBLIC_API_URL.replace(/\/+$/, "");

/** The MCP resource URL every grant is bound to. */
export const mcpResourceUrl = () => `${issuerUrl()}/mcp`;

/** URL of the protected-resource metadata advertised in `WWW-Authenticate` on `/mcp` 401s. */
export const mcpResourceMetadataUrl = () =>
  `${issuerUrl()}/.well-known/oauth-protected-resource/mcp`;

const random = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;

/** New plaintext authorization code. */
export const generateCode = () => random("flc_");
/** New plaintext `flo_` access token. */
export const generateAccessToken = () => random("flo_");
/** New plaintext `flr_` refresh token. */
export const generateRefreshToken = () => random("flr_");

/** Access expiry: one hour from `now`, capped at the grant expiry (`null` = Never). */
export function resolveAccessExpiry(now: Date, grantExpiresAt: Date | null) {
  const expiry = new Date(now.getTime() + ACCESS_TOKEN_TTL_MS);
  return grantExpiresAt && grantExpiresAt < expiry ? grantExpiresAt : expiry;
}
