import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "../../../components/Card";
import { RecordCard } from "../../../components/RecordCard";
import * as oauthClient from "../../../services/oauth.client";
import type { OAuthGrant } from "../../../types/oauth.types";
import { formatExpiry, formatLastUsed } from "../utils/apiKeyDisplay";
import { ConfirmRevokeDialog } from "./ConfirmRevokeDialog";

/** Lists AI clients connected through OAuth and lets the user disconnect (revoke) them. */
export function ConnectedAppsSection() {
  const queryClient = useQueryClient();
  const [revoking, setRevoking] = useState<OAuthGrant | null>(null);
  const [notice, setNotice] = useState("");

  const grantsQuery = useQuery({
    queryKey: ["oauth-grants"],
    queryFn: () => oauthClient.listOAuthGrants().then((r) => r.grants)
  });

  const revoke = useMutation({
    mutationFn: oauthClient.revokeOAuthGrant,
    onSuccess: () => {
      setNotice(`${revoking?.clientName ?? "App"} disconnected.`);
      setRevoking(null);
      return queryClient.invalidateQueries({ queryKey: ["oauth-grants"] });
    }
  });

  const grants = grantsQuery.data ?? [];

  return (
    <Card>
      <h3 className="text-lg font-semibold">Connected apps</h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        AI clients you have authorized to access your account.
      </p>
      <div className="mt-4 grid gap-3">
        {grantsQuery.isError ? (
          <p className="text-sm text-red-600 dark:text-red-400">Connected apps could not be loaded</p>
        ) : null}
        {grantsQuery.isSuccess && grants.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No connected apps.</p>
        ) : null}
        {grants.map((grant) => (
          <RecordCard
            key={grant.id}
            title={<p className="font-semibold">{grant.clientName}</p>}
            subtitle={
              <p className="text-slate-500 dark:text-slate-400">
                {grant.redirectHost} · {grant.scopes.includes("write") ? "Read + Write" : "Read"} · Connected{" "}
                {new Date(grant.createdAt).toLocaleDateString()} · {formatExpiry(grant.expiresAt)} ·{" "}
                {formatLastUsed(grant.lastUsedAt)}
              </p>
            }
            actions={[{ key: "revoke", label: "Revoke", variant: "danger", onClick: () => setRevoking(grant) }]}
          />
        ))}
      </div>
      <p role="status" aria-live="polite" className="mt-3 text-sm text-slate-600 dark:text-slate-300">
        {notice}
      </p>
      {revoking ? (
        <ConfirmRevokeDialog
          title={`Disconnect "${revoking.clientName}"?`}
          body="This app will lose access to your account immediately."
          confirmLabel="Disconnect"
          pending={revoke.isPending}
          onConfirm={() => revoke.mutate(revoking.id)}
          onCancel={() => setRevoking(null)}
        />
      ) : null}
    </Card>
  );
}
