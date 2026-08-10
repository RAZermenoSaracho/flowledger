import { env } from "../../../config/env.js";

/** Cookie name carrying the opaque refresh token. */
export const refreshTokenCookieName = "flowledger_refresh_token";

/** Parses a raw `Cookie` header into a name-to-value map, URI-decoding values. */
export function parseCookies(header: string | undefined) {
  const cookies = new Map<string, string>();

  for (const part of header?.split(";") ?? []) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;

    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (name) cookies.set(name, decodeURIComponent(value));
  }

  return cookies;
}

/** Reads the refresh token value out of a raw `Cookie` header, if present. */
export function readRefreshTokenCookie(cookieHeader: string | undefined) {
  return parseCookies(cookieHeader).get(refreshTokenCookieName);
}

/** Builds the `Set-Cookie` header value for the refresh token: httpOnly, `SameSite=Strict`, scoped to `/auth`, `Max-Age` derived from `expiresAt`, and (in production) `Domain`/`Secure`. */
export function buildRefreshTokenCookie(token: string, expiresAt: Date) {
  const maxAgeSeconds = Math.max(
    0,
    Math.floor((expiresAt.getTime() - Date.now()) / 1000)
  );
  const parts = [
    `${refreshTokenCookieName}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/auth",
    `Max-Age=${maxAgeSeconds}`
  ];

  if (env.REFRESH_TOKEN_COOKIE_DOMAIN) {
    parts.push(`Domain=${env.REFRESH_TOKEN_COOKIE_DOMAIN}`);
  }

  if (env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

/** Builds the `Set-Cookie` header value that clears the refresh token cookie. */
export function clearRefreshTokenCookie() {
  const parts = [
    `${refreshTokenCookieName}=`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/auth",
    "Max-Age=0"
  ];

  if (env.REFRESH_TOKEN_COOKIE_DOMAIN) {
    parts.push(`Domain=${env.REFRESH_TOKEN_COOKIE_DOMAIN}`);
  }

  if (env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}
