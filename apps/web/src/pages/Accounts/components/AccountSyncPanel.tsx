import { Button } from "../../../components/Button";
import type { Account, AccountSync } from "../../../types/accounts.types";
import { formatMoney } from "../../../utils/currency";
import { formatDateTime, formatStatus } from "../utils/accountDisplay";

export function AccountSyncPanel({
  account,
  resyncMessages,
  isStartingCredentialFlow,
  onResync,
  onReconnect,
  hasCredentialFlowError
}: {
  account: Account;
  resyncMessages: Record<string, string>;
  isStartingCredentialFlow: boolean;
  onResync: (syncId: string) => void;
  onReconnect: (syncId: string) => void;
  hasCredentialFlowError: boolean;
}) {
  if (account.source !== "synced" || !account.sync?.length) return null;

  return (
    <div className="grid gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
      {account.sync.map((sync: AccountSync) => (
        <div
          key={sync.id}
          className="grid gap-3 rounded-md bg-slate-50 p-3 dark:bg-slate-900 md:grid-cols-[minmax(0,1fr)_auto]"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold capitalize">{sync.provider}</p>
              <span className="rounded bg-white px-2 py-0.5 text-xs font-semibold capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {formatStatus(sync.status)}
              </span>
              {sync.connectionStatus ? (
                <span className="rounded bg-white px-2 py-0.5 text-xs font-semibold capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Connection {formatStatus(sync.connectionStatus)}
                </span>
              ) : null}
              {sync.requiresManualReconnect ? (
                <span className="rounded bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800 dark:bg-orange-950 dark:text-orange-200">
                  Reconnect required
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {[
                sync.institutionName,
                sync.accountName,
                sync.accountType,
                sync.currency
              ]
                .filter(Boolean)
                .join(" · ") || "Provider metadata unavailable"}
            </p>
            <div className="mt-2 grid gap-1 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
              <p>
                Last sync{" "}
                <span className="font-semibold">
                  {formatDateTime(sync.lastSyncAt)}
                </span>
              </p>
              <p>
                External balance{" "}
                <span className="font-semibold">
                  {sync.externalBalance !== null &&
                  sync.externalBalance !== undefined
                    ? formatMoney(sync.externalBalance, sync.currency ?? "USD")
                    : "Unavailable"}
                </span>
              </p>
              <p>
                Last success{" "}
                <span className="font-semibold">
                  {formatDateTime(sync.lastSyncSuccessAt)}
                </span>
              </p>
              <p>
                Last failure{" "}
                <span className="font-semibold">
                  {formatDateTime(sync.lastSyncFailureAt)}
                </span>
              </p>
            </div>
            {sync.failureReason ? (
              <p className="mt-2 text-sm text-coral dark:text-orange-300">
                {sync.failureReason}
              </p>
            ) : null}
            {resyncMessages[sync.id] ? (
              <p
                className={`mt-2 text-sm ${
                  sync.requiresManualReconnect
                    ? "text-coral dark:text-orange-300"
                    : "text-pine dark:text-emerald-300"
                }`}
              >
                {resyncMessages[sync.id]}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
            <Button
              type="button"
              variant="secondary"
              disabled={isStartingCredentialFlow || account.isArchived}
              onClick={() => onResync(sync.id)}
            >
              Resync
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={
                isStartingCredentialFlow ||
                account.isArchived ||
                !sync.provider ||
                !sync.providerCredentialId
              }
              onClick={() => onReconnect(sync.id)}
            >
              Reconnect
            </Button>
          </div>
        </div>
      ))}

      {hasCredentialFlowError ? (
        <p className="text-sm text-coral dark:text-orange-300">
          Could not start the selected Syncfy credential flow.
        </p>
      ) : null}
    </div>
  );
}
