import { secureAttribute } from "../../../utils/refreshTokenCookie.js";

/**
 * Cookie name carrying the OAuth state nonce between the start and callback legs.
 * Carries the `__Host-` prefix whenever the cookie is `Secure`, so browsers refuse a copy planted from a sibling subdomain;
 * plain-HTTP development keeps the unprefixed name because `__Host-` requires `Secure`.
 */
export function googleStateCookieName() {
  return secureAttribute().length > 0
    ? "__Host-flowledger_google_oauth_state"
    : "flowledger_google_oauth_state";
}

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

/**
 * Builds the `Set-Cookie` header value for the OAuth state cookie. Never sets `Domain`.
 * On HTTPS it is `Secure; Path=/` (required by `__Host-`); over HTTP it stays scoped to the callback path.
 * Pass `("", 0)` to clear it: the name and attributes match, which browsers require for the delete to apply.
 */
export function googleStateCookie(nonce: string, maxAgeSeconds: number) {
  const secure = secureAttribute();
  const parts = [
    `${googleStateCookieName()}=${encodeURIComponent(nonce)}`,
    "HttpOnly",
    "SameSite=Lax",
    secure.length > 0 ? "Path=/" : "Path=/auth/google/callback",
    `Max-Age=${maxAgeSeconds}`
  ];

  return [...parts, ...secure].join("; ");
}

/** Cookie name carrying the signed pending-link token from the callback to the completion request. */
export const googleLinkPendingCookieName = "flowledger_google_link_pending";

/** Builds the `Set-Cookie` header value for the pending-link cookie, scoped to the link path and `Secure` on HTTPS deployments. */
export function googleLinkPendingCookie(value: string, maxAgeSeconds: number) {
  const parts = [
    `${googleLinkPendingCookieName}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/auth/google/link",
    `Max-Age=${maxAgeSeconds}`
  ];

  return [...parts, ...secureAttribute()].join("; ");
}
