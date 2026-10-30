import type { CredentialLifetime } from "@flowledger/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { useAuth } from "../../hooks/useAuth";
import { getConsentContext, submitConsentDecision } from "../../services/oauth.client";

const lifetimeOptions: { value: CredentialLifetime; label: string }[] = [
  { value: "1d", label: "1 day" },
  { value: "1m", label: "1 month" },
  { value: "1y", label: "1 year" },
  { value: "never", label: "Never" }
];

const radioLabel = "flex min-h-11 items-center gap-2 text-sm";

/** True when the page is rendered inside any frame (or when the check itself is blocked). */
function isFramed() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * OAuth consent screen for an AI client's authorization request. Rendered outside `AppLayout`
 * and behind `ProtectedRoute`, so an unauthenticated visitor is sent to login and returned here.
 * Never shows its actions inside a frame; on decision the browser is sent to the server-built redirect URL.
 */
export function OAuthAuthorizePage() {
  const auth = useAuth();
  const [params] = useSearchParams();
  const req = params.get("req") ?? "";
  const [allowWrite, setAllowWrite] = useState(false);
  const [lifetime, setLifetime] = useState<CredentialLifetime>("1m");
  const [framed] = useState(isFramed);

  const context = useQuery({
    queryKey: ["oauth-consent", req],
    queryFn: () => getConsentContext(req),
    enabled: Boolean(req) && !framed,
    retry: false
  });

  const decide = useMutation({
    mutationFn: (approve: boolean) => submitConsentDecision({ req, approve, allowWrite: approve && allowWrite, lifetime }),
    onSuccess: ({ redirectUrl }) => window.location.assign(redirectUrl)
  });

  const data = context.data;
  const busy = decide.isPending || decide.isSuccess;

  let body;
  if (framed) {
    body = (
      <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
        For your security this page cannot be used inside a frame. Open it in its own browser tab.
      </p>
    );
  } else if (!req || context.isError) {
    body = (
      <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
        This authorization request is invalid or has expired. Return to the app and try connecting again.
      </p>
    );
  } else if (!data) {
    body = <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Loading…</p>;
  } else {
    body = (
      <>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          <strong>{data.client.name}</strong> ({data.client.redirectHost}) wants to access your FlowLedger account.
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Signed in as {data.user.email}.{" "}
          <button
            type="button"
            className="font-semibold text-pine underline dark:text-emerald-300"
            onClick={() => void auth.logout()}
          >
            Not you?
          </button>
        </p>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">Permissions</legend>
          <label className={radioLabel}>
            <input type="checkbox" checked disabled />
            Read your accounts, categories and transactions
          </label>
          {data.scopes.requested.includes("write") ? (
            <label className={radioLabel}>
              <input type="checkbox" checked={allowWrite} onChange={(event) => setAllowWrite(event.target.checked)} />
              Also create and update transactions
            </label>
          ) : null}
        </fieldset>

        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">Access lasts</legend>
          {lifetimeOptions.map((option) => (
            <label key={option.value} className={radioLabel}>
              <input
                type="radio"
                name="lifetime"
                checked={lifetime === option.value}
                onChange={() => setLifetime(option.value)}
              />
              {option.label}
            </label>
          ))}
          {lifetime === "never" ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              This app keeps access until you revoke it in Developer settings.
            </p>
          ) : null}
        </fieldset>

        {decide.isError ? (
          <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
            {decide.error instanceof Error ? decide.error.message : "Could not complete the request"}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button type="button" className="min-h-11" disabled={busy} onClick={() => decide.mutate(true)}>
            Allow
          </Button>
          <Button type="button" variant="secondary" className="min-h-11" disabled={busy} onClick={() => decide.mutate(false)}>
            Deny
          </Button>
        </div>
      </>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 dark:bg-slate-950">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold">Authorize access</h1>
        {body}
      </Card>
    </main>
  );
}
