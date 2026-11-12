import type { MuseClientDocument, OAuthConsentContext, OAuthDecisionInput, OAuthGrant } from "../types/oauth.types";
import { apiRequest, apiUrl } from "./api.client";

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

/** Fetches the public Muse Client ID Metadata Document (no auth); rejects when the API does not return a usable `client_id`. */
export async function getMuseClientDocument(): Promise<MuseClientDocument> {
  const response = await fetch(apiUrl("/oauth/clients/meta-muse.json"));
  const doc = response.ok ? ((await response.json()) as Partial<MuseClientDocument>) : null;
  if (!doc || typeof doc.client_id !== "string" || !doc.client_id) throw new Error("Muse client document unavailable");
  return { client_id: doc.client_id };
}
