import { ApiError, apiRequest, apiUrl, registerSessionExpiredHandler, tokenStore } from "./api.client";
import type { User } from "../types/users.types";

/** Authenticates via email/password. */
export function login(email: string, password: string, keepLoggedIn: boolean) {
  return apiRequest<{ token: string; user: User }>("/auth/login", {
    method: "POST",
    body: { email, password, keepLoggedIn }
  });
}

/** Registers a new user. */
export function register(name: string, email: string, password: string) {
  return apiRequest<{ token: string; user: User }>("/auth/register", {
    method: "POST",
    body: { name, email, password }
  });
}

/** Fetches the authenticated user's profile. */
export function getMe() {
  return apiRequest<{ user: User }>("/auth/me");
}

/** Silently restores a session from the httpOnly refresh cookie. Resolves `null` when the server rejects the session, and throws when it can't be reached or fails, since the session may still be valid. */
export async function refreshSession() {
  try {
    return await apiRequest<{ token: string; user: User }>("/auth/refresh", {
      method: "POST"
    });
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 401) return null;
    throw caught;
  }
}

/** Revokes the refresh token server-side, then clears the local access token. Throws on failure and leaves the token in place, so the session is still usable and the caller can retry. */
export async function logout() {
  await apiRequest("/auth/logout", { method: "POST" });
  clearToken();
}

/** Asks the API to start linking a Google identity to the signed-in user; resolves the Google consent URL to navigate to. */
export function startGoogleLink() {
  return apiRequest<{ url: string }>("/auth/google/link", { method: "POST" });
}

/** Reports whether the signed-in user has a Google identity linked. */
export function getGoogleLinkStatus() {
  return apiRequest<{ connected: boolean }>("/auth/google/link");
}

/** Builds the Google OAuth start URL, encoding where to redirect after login and the session mode. */
export function googleOAuthUrl(redirect: string, keepLoggedIn: boolean) {
  return apiUrl(`/auth/google?redirect=${encodeURIComponent(redirect)}&keepLoggedIn=${keepLoggedIn}`);
}

/**
 * Reads the stored auth token, for auth-flow call sites (route guards, the
 * auth context, OAuth callback handling). Not a data-fetching concern, but
 * kept here rather than read directly from `tokenStore` so nothing outside
 * `services/` reaches into `services/api.client.ts`.
 */
export function getToken() {
  return tokenStore.get();
}

/** Stores the auth token. */
export function setToken(token: string) {
  tokenStore.set(token);
}

/** Clears the stored auth token. */
export function clearToken() {
  tokenStore.clear();
}

const LEGACY_TOKEN_KEY = "flowledger.token";

/**
 * Deletes the access token that versions before the in-memory token store kept in `localStorage`.
 * Nothing reads it, but it stays readable by any script on the origin until removed. Never throws:
 * `localStorage` access raises when site data is blocked.
 */
export function clearLegacyStoredToken() {
  try {
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    return;
  }
}

/** Registers a callback invoked when a mid-session silent token refresh fails — see `registerSessionExpiredHandler` in `api.client.ts` for exactly when this fires. */
export function onSessionExpired(handler: () => void) {
  registerSessionExpiredHandler(handler);
}
