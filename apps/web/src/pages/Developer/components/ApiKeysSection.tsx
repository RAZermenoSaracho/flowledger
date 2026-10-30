import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateApiKeyInput } from "@flowledger/shared";
import { useState } from "react";
import { Card } from "../../../components/Card";
import { RecordCard } from "../../../components/RecordCard";
import * as apiKeysClient from "../../../services/apiKeys.client";
import type { ApiKey } from "../../../types/apiKeys.types";
import { formatExpiry, formatLastUsed } from "../utils/apiKeyDisplay";
import { ApiKeyRevealDialog } from "./ApiKeyRevealDialog";
import { CreateApiKeyForm } from "./CreateApiKeyForm";
import { RevokeApiKeyDialog } from "./RevokeApiKeyDialog";

/**
 * Create / list / revoke personal API keys. The plaintext secret is held only in
 * component state (never the query cache) and cleared when the reveal dialog closes.
 */
export function ApiKeysSection() {
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);

  const keysQuery = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => apiKeysClient.listApiKeys().then((r) => r.apiKeys)
  });

  const create = useMutation({
    mutationFn: apiKeysClient.createApiKey,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] })
  });

  const revoke = useMutation({
    mutationFn: apiKeysClient.revokeApiKey,
    onSuccess: () => {
      setRevoking(null);
      return queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    }
  });

  async function createKey(input: CreateApiKeyInput) {
    const result = await create.mutateAsync(input);
    create.reset();
    setSecret(result.key);
  }

  const keys = keysQuery.data ?? [];

  return (
    <Card>
      <h3 className="text-lg font-semibold">Personal API keys</h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Keys let scripts and AI clients act on your account. Prefer read-only keys with a short lifetime.
      </p>
      <div className="mt-4">
        <CreateApiKeyForm onSubmit={createKey} disabled={create.isPending} />
      </div>

      <div className="mt-6 grid gap-3">
        {keysQuery.isError ? (
          <p className="text-sm text-red-600 dark:text-red-400">API keys could not be loaded</p>
        ) : null}
        {keysQuery.isSuccess && keys.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No API keys yet.</p>
        ) : null}
        {keys.map((key) => (
          <RecordCard
            key={key.id}
            title={<p className="font-semibold">{key.name}</p>}
            subtitle={
              <p className="text-slate-500 dark:text-slate-400">
                {key.hint}… · {key.scopes.includes("write") ? "Read + Write" : "Read"} ·{" "}
                {key.revokedAt ? "Revoked" : formatExpiry(key.expiresAt)} ·{" "}
                {formatLastUsed(key.lastUsedAt)}
              </p>
            }
            actions={
              key.revokedAt
                ? []
                : [
                    {
                      key: "revoke",
                      label: "Revoke",
                      variant: "danger",
                      onClick: () => setRevoking(key)
                    }
                  ]
            }
          />
        ))}
      </div>

      {secret ? <ApiKeyRevealDialog secret={secret} onClose={() => setSecret(null)} /> : null}
      {revoking ? (
        <RevokeApiKeyDialog
          apiKey={revoking}
          pending={revoke.isPending}
          onConfirm={() => revoke.mutate(revoking.id)}
          onCancel={() => setRevoking(null)}
        />
      ) : null}
    </Card>
  );
}
