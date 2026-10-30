/** Permission scopes a personal API key can carry. */
export type ApiKeyScope = "read" | "write";

/** Personal API key metadata as returned by the API; never contains the secret. */
export type ApiKey = {
  id: string;
  name: string;
  hint: string;
  scopes: ApiKeyScope[];
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

/** Response of key creation: metadata plus the plaintext key, returned exactly once. */
export type CreatedApiKey = {
  apiKey: ApiKey;
  key: string;
};
