/** Permission carried by a credential; `write` implies `read`. */
export type CredentialScope = "read" | "write";

/** Result of successfully verifying a bearer credential. */
export interface VerifiedCredential {
  userId: string;
  email: string;
  scopes: CredentialScope[];
  kind: "apiKey";
  credentialId: string;
}
