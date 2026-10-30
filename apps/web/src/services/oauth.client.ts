import type { OAuthConsentContext, OAuthDecisionInput, OAuthGrant } from "../types/oauth.types";
import { apiRequest } from "./api.client";

/** Loads the consent details for a signed consent request; rejects if it is invalid or expired. */
export function getConsentContext(req: string) {
  return apiRequest<OAuthConsentContext>("/oauth/authorize/context", { query: { req } });
}

/** Submits the allow/deny decision; resolves with the URL the browser must be sent to. */
export function submitConsentDecision(body: OAuthDecisionInput) {
  return apiRequest<{ redirectUrl: string }>("/oauth/authorize/decision", { method: "POST", body });
}

/** Lists the user's connected apps (active OAuth grants). */
export function listOAuthGrants() {
  return apiRequest<{ grants: OAuthGrant[] }>("/users/me/oauth-grants");
}

/** Revokes a connected app, invalidating its tokens. */
export function revokeOAuthGrant(id: string) {
  return apiRequest<void>(`/users/me/oauth-grants/${id}`, { method: "DELETE" });
}
