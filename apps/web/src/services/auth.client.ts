import { apiRequest, apiUrl, tokenStore } from "./api";
import type { User } from "../types/api";

export function login(email: string, password: string) {
  return apiRequest<{ token: string; user: User }>("/auth/login", {
    method: "POST",
    body: { email, password }
  });
}

export function register(name: string, email: string, password: string) {
  return apiRequest<{ token: string; user: User }>("/auth/register", {
    method: "POST",
    body: { name, email, password }
  });
}

export function getMe() {
  return apiRequest<{ user: User }>("/auth/me");
}

export function googleOAuthUrl(redirect: string) {
  return apiUrl(`/auth/google?redirect=${encodeURIComponent(redirect)}`);
}

// Session-token access for auth-flow call sites (route guards, the auth
// context, OAuth callback handling). Not a data-fetching concern, but kept
// here rather than accessed directly so nothing outside services/ reaches
// into services/api.ts.
export function getToken() {
  return tokenStore.get();
}

export function setToken(token: string) {
  tokenStore.set(token);
}

export function clearToken() {
  tokenStore.clear();
}
