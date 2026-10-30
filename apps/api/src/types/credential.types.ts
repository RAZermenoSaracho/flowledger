/** Permission carried by a credential; `write` implies `read`. */
export type CredentialScope = "read" | "write";

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
