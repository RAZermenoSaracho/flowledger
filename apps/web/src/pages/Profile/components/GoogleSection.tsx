import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { completeGoogleLink, getGoogleLinkStatus, startGoogleLink } from "../../../services/auth.client";

const resultMessages: Record<string, { text: string; isError: boolean }> = {
  connected: { text: "Google is now connected.", isError: false },
  conflict: { text: "That Google account could not be connected. It may already be in use.", isError: true },
  failed: { text: "Google could not be connected. Try again.", isError: true }
};

/**
 * Google sign-in row for the Security tab: shows whether Google is connected and starts the link flow.
 * Reads the `googleLink` param the API appends on return and removes it from the URL. A `pending` value completes the link once under the signed-in session before its result is shown.
 */
export function GoogleSection() {
  const [params, setParams] = useSearchParams();
  const [result] = useState(() => params.get("googleLink"));
  const queryClient = useQueryClient();
  const completed = useRef(false);
  const [completion, setCompletion] = useState<string>();
  const { mutate: completeLink } = useMutation({
    mutationFn: completeGoogleLink,
    onSuccess: (data) => setCompletion(data.result),
    onError: () => setCompletion("failed"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["google-link"] })
  });
  const isConnecting = result === "pending" && !completion;
  const outcome = result === "pending" ? completion : result;
  const message = outcome ? resultMessages[outcome] : undefined;

  useEffect(() => {
    if (result !== "pending" || completed.current) return;
    completed.current = true;
    completeLink();
  }, [result, completeLink]);

  useEffect(() => {
    if (!params.has("googleLink")) return;
    const next = new URLSearchParams(params);
    next.delete("googleLink");
    setParams(next, { replace: true });
  }, [params, setParams]);

  const status = useQuery({ queryKey: ["google-link"], queryFn: getGoogleLinkStatus });
  const connect = useMutation({
    mutationFn: startGoogleLink,
    onSuccess: ({ url }) => window.location.assign(url)
  });

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">Google</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {status.data?.connected
              ? "Google is connected. You can sign in with it."
              : "Connect Google to sign in with it."}
          </p>
        </div>
        {status.data && !status.data.connected ? (
          <Button
            type="button"
            className="min-h-11 sm:shrink-0"
            disabled={connect.isPending || connect.isSuccess}
            onClick={() => connect.mutate()}
          >
            Connect Google
          </Button>
        ) : null}
      </div>
      {isConnecting ? (
        <p role="status" className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          Connecting Google…
        </p>
      ) : null}
      {message ? (
        <p
          role={message.isError ? "alert" : "status"}
          className={`mt-3 text-sm ${message.isError ? "text-red-600 dark:text-red-400" : "text-pine dark:text-emerald-300"}`}
        >
          {message.text}
        </p>
      ) : null}
      {connect.isError ? (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          Google could not be connected. Try again.
        </p>
      ) : null}
    </Card>
  );
}
