import type { CredentialLifetime } from "@flowledger/shared";

/** Scope an OAuth client can request or hold. */
export type OAuthScope = "read" | "write";

/** Data the consent page renders, derived from the signed consent request. */
export type OAuthConsentContext = {
  client: { name: string; redirectHost: string };
  scopes: { requested: OAuthScope[] };
  user: { email: string };
};

/** Body of the consent decision. */
export type OAuthDecisionInput = {
  req: string;
  approve: boolean;
  allowWrite: boolean;
  lifetime: CredentialLifetime;
};

/** A connected app (OAuth grant) as listed on the Developer page; never contains tokens. */
export type OAuthGrant = {
  id: string;
  clientName: string;
  redirectHost: string;
  scopes: OAuthScope[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
};
