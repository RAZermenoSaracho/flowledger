import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateApiKeyInput } from "@flowledger/shared";
import { useRef, useState } from "react";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { RecordCard } from "../../../components/RecordCard";
import * as apiKeysClient from "../../../services/apiKeys.client";
import type { ApiKey } from "../../../types/apiKeys.types";
import { formatExpiry, formatLastUsed } from "../utils/apiKeyDisplay";
import { ApiKeyRevealDialog } from "./ApiKeyRevealDialog";
import { CreateApiKeyDialog } from "./CreateApiKeyDialog";
import { ConfirmRevokeDialog } from "./ConfirmRevokeDialog";

/**
 * Create / list / revoke personal API keys. The plaintext secret is held only in
 * component state (never the query cache) and cleared when the reveal dialog closes.
 */
export function ApiKeysSection() {
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);

  // Deferred: the closing modal dialog still makes the rest of the page inert until React unmounts it.
  const focusTrigger = () => setTimeout(() => triggerRef.current?.querySelector("button")?.focus());

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
    setCreating(false);
    setSecret(result.key);
  }

  const keys = keysQuery.data ?? [];

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Personal API keys</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Keys let scripts and AI clients act on your account. Prefer read-only keys with a short lifetime.
          </p>
        </div>
        <div ref={triggerRef} className="flex flex-col sm:shrink-0">
          <Button type="button" className="min-h-11" onClick={() => setCreating(true)}>
            Create API key
          </Button>
        </div>
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

      {creating ? (
        <CreateApiKeyDialog
          onSubmit={createKey}
          onCancel={() => {
            setCreating(false);
            focusTrigger();
          }}
          disabled={create.isPending}
        />
      ) : null}
      {secret ? (
        <ApiKeyRevealDialog
          secret={secret}
          onClose={() => {
            setSecret(null);
            focusTrigger();
          }}
        />
      ) : null}
      {revoking ? (
        <ConfirmRevokeDialog
          title={`Revoke "${revoking.name}"?`}
          body="Anything using this key will stop working immediately."
          confirmLabel="Revoke key"
          pending={revoke.isPending}
          onConfirm={() => revoke.mutate(revoking.id)}
          onCancel={() => setRevoking(null)}
        />
      ) : null}
    </Card>
  );
}
