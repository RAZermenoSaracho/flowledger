import { apiRequest, apiUrl, tokenStore } from "./api.client";
import type { User } from "../types/users.types";

/** Authenticates via email/password. */
export function login(email: string, password: string) {
  return apiRequest<{ token: string; user: User }>("/auth/login", {
    method: "POST",
    body: { email, password }
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

/** Builds the Google OAuth start URL, encoding where to redirect after login. */
export function googleOAuthUrl(redirect: string) {
  return apiUrl(`/auth/google?redirect=${encodeURIComponent(redirect)}`);
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
