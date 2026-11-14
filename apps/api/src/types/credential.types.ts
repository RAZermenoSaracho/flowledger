/** Permission carried by a credential; `write` implies `read`, `ingest` implies neither and is API-key only (OAuth never grants it). */
export type CredentialScope = "read" | "write" | "ingest";

/** What kind of credential authenticated a request. */
export type CredentialKind = "apiKey" | "oauth";

/** Result of successfully verifying a bearer credential. */
export interface VerifiedCredential {
  userId: string;
  email: string;
  scopes: CredentialScope[];
  kind: CredentialKind;
  credentialId: string;
}
