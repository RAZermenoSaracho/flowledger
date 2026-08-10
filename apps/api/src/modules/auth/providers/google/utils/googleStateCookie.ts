import { env } from "../../../../../config/env.js";

/** Cookie name carrying the OAuth state nonce between the start and callback legs. */
export const googleStateCookieName = "flowledger_google_oauth_state";

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

/** Builds the `Set-Cookie` header value for the OAuth state cookie, scoped to the callback path and `Secure` in production. */
export function googleStateCookie(nonce: string, maxAgeSeconds: number) {
  const parts = [
    `${googleStateCookieName}=${encodeURIComponent(nonce)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/auth/google/callback",
    `Max-Age=${maxAgeSeconds}`
  ];

  if (env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}
