import type { CreateApiKeyInput } from "@flowledger/shared";
import type { ApiKey, CreatedApiKey } from "../types/apiKeys.types";
import { apiRequest } from "./api.client";

/** Creates a personal API key; the plaintext `key` in the response is never retrievable again. */
export function createApiKey(body: CreateApiKeyInput) {
  return apiRequest<CreatedApiKey>("/users/me/api-keys", {
    method: "POST",
    body
  });
}

/** Lists the user's API keys (metadata only). */
export function listApiKeys() {
  return apiRequest<{ apiKeys: ApiKey[] }>("/users/me/api-keys");
}

/** Revokes an API key; idempotent. */
export function revokeApiKey(id: string) {
  return apiRequest<void>(`/users/me/api-keys/${id}`, { method: "DELETE" });
}
