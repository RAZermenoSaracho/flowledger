import { env } from "../../../../../config/env.js";

export const googleStateCookieName = "flowledger_google_oauth_state";

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

export function redirectOAuthFailure(
  res: { redirect: (url: string) => void },
  message: string
) {
  const url = new URL("/login", env.WEB_APP_URL);
  url.searchParams.set("oauthError", message);
  res.redirect(url.toString());
}
