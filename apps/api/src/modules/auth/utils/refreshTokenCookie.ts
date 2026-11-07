import { env } from "../../../config/env.js";

const isProduction = env.NODE_ENV === "production";

/** Cookie name carrying the opaque refresh token. Differs outside production because environments on sibling subdomains share one cookie domain. */
export const refreshTokenCookieName = isProduction
  ? "flowledger_refresh_token"
  : "flowledger_dev_refresh_token";

/** Name of the non-secret cookie that tells the landing gateway a session exists, since the refresh cookie is never sent on `/`. */
export const sessionPresenceCookieName = isProduction
  ? "flowledger_session"
  : "flowledger_dev_session";

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

function sharedAttributes() {
  const parts: string[] = [];

  if (env.REFRESH_TOKEN_COOKIE_DOMAIN) {
    parts.push(`Domain=${env.REFRESH_TOKEN_COOKIE_DOMAIN}`);
  }

  if (env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  return parts;
}

function buildCookies(
  refreshTokenValue: string,
  presenceValue: string,
  lifetime: string[]
) {
  return [
    [
      `${refreshTokenCookieName}=${refreshTokenValue}`,
      "HttpOnly",
      "SameSite=Strict",
      "Path=/auth",
      ...lifetime,
      ...sharedAttributes()
    ].join("; "),
    [
      `${sessionPresenceCookieName}=${presenceValue}`,
      "HttpOnly",
      "SameSite=Lax",
      "Path=/",
      ...lifetime,
      ...sharedAttributes()
    ].join("; ")
  ];
}

/**
 * Builds the `Set-Cookie` values for a session: the refresh token, and a presence cookie holding no credential.
 *
 * A persistent session gets a `Max-Age` derived from `expiresAt`; otherwise both are browser-session cookies.
 */
export function buildSessionCookies(refreshToken: {
  token: string;
  expiresAt: Date;
  persistent: boolean;
}) {
  const maxAgeSeconds = Math.max(
    0,
    Math.floor((refreshToken.expiresAt.getTime() - Date.now()) / 1000)
  );

  return buildCookies(
    encodeURIComponent(refreshToken.token),
    "1",
    refreshToken.persistent ? [`Max-Age=${maxAgeSeconds}`] : []
  );
}

/** Builds the `Set-Cookie` values that clear both session cookies. */
export function clearSessionCookies() {
  return buildCookies("", "", ["Max-Age=0"]);
}
