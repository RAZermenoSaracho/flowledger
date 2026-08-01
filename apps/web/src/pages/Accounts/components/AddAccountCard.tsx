import { ACCOUNT_TYPES } from "@flowledger/shared";
import type { AccountType } from "@flowledger/shared";
import { FormEvent } from "react";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { CurrencySelect } from "../../../components/CurrencySelect";
import { SelectField, TextInput } from "../../../components/FormField";
import { formatMoney } from "../../../utils/currency";
import type { useAccountProviderSync } from "../hooks/useAccountProviderSync";

export function AddAccountCard({
  sync
}: {
  sync: ReturnType<typeof useAccountProviderSync>;
}) {
  async function submit(event: FormEvent) {
    event.preventDefault();
    await sync.createAccount.mutateAsync();
  }

  if (!sync.isFormOpen) {
    return (
      <Card>
        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={() => {
            sync.setAddMode(null);
            sync.setIsFormOpen(true);
          }}
        >
          Add account
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <h2 className="text-lg font-semibold">
          {sync.addMode === "manual"
            ? "New manual account"
            : sync.addMode === "sync"
              ? "Sync accounts"
              : "Add account"}
        </h2>
        <Button
          type="button"
          variant="secondary"
          className="w-full sm:w-auto"
          onClick={sync.closeForm}
        >
          Cancel
        </Button>
      </div>

      {sync.addMode === null ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <button
            type="button"
            className="rounded-md border border-slate-200 p-4 text-left transition hover:border-pine hover:bg-slate-50 dark:border-slate-800 dark:hover:border-emerald-700 dark:hover:bg-slate-900"
            onClick={() => sync.setAddMode("manual")}
          >
            <p className="font-semibold">Manual account</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Create an account yourself and manage balances from your
              transactions.
            </p>
          </button>
          <button
            type="button"
            className="rounded-md border border-slate-200 p-4 text-left transition hover:border-pine hover:bg-slate-50 dark:border-slate-800 dark:hover:border-emerald-700 dark:hover:bg-slate-900"
            onClick={() => sync.setAddMode("sync")}
          >
            <p className="font-semibold">Sync accounts</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Choose a provider. The provider widget will open so you can
              select and connect your institution securely.
            </p>
          </button>
        </div>
      ) : null}

      {sync.addMode === "manual" ? (
        <form className="mt-4 grid gap-4 md:grid-cols-5" onSubmit={submit}>
          <TextInput
            label="Name"
            value={sync.name}
            onChange={(event) => sync.setName(event.target.value)}
            required
          />
          <SelectField
            label="Type"
            value={sync.type}
            onChange={(event) => sync.setType(event.target.value as AccountType)}
          >
            {ACCOUNT_TYPES.map((item) => (
              <option key={item} value={item}>
                {item.replace("_", " ")}
              </option>
            ))}
          </SelectField>
          <TextInput
            label="Identifier"
            value={sync.identifier}
            onChange={(event) => sync.setIdentifier(event.target.value)}
          />
          <CurrencySelect
            label="Currency"
            value={sync.currency}
            onChange={sync.setCurrency}
          />
          <TextInput
            label="Initial balance"
            type="number"
            step="0.01"
            value={sync.initialBalance}
            onChange={(event) => sync.setInitialBalance(event.target.value)}
          />
          <div className="flex flex-col gap-2 md:col-span-5 sm:flex-row">
            <Button type="submit" disabled={sync.createAccount.isPending}>
              Save account
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => sync.setAddMode(null)}
            >
              Back
            </Button>
          </div>
        </form>
      ) : null}

      {sync.addMode === "sync" ? (
        <div className="mt-4 grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            {(sync.connectorsQuery.data ?? []).map((connector) => {
              const connectorKey = `connector:${connector.provider}:${connector.connectorId}`;
              const isStarting =
                sync.selectedConnectorId === connectorKey &&
                sync.startProviderConnection.isPending;

              return (
                <button
                  key={connectorKey}
                  type="button"
                  className="rounded-md border border-slate-200 p-4 text-left transition hover:border-pine hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:hover:border-emerald-700 dark:hover:bg-slate-900"
                  disabled={sync.startProviderConnection.isPending}
                  onClick={() => {
                    sync.setSelectedConnectorId(connectorKey);
                    sync.setActiveConnection(null);
                    sync.setSyncfyWidgetError(null);
                    sync.startProviderConnection.mutate({
                      provider: connector.provider
                    });
                  }}
                >
                  <span className="block text-xs font-semibold uppercase tracking-wide text-pine dark:text-emerald-300">
                    {connector.coverageLabel} · {connector.category}
                  </span>
                  <span className="mt-1 block font-semibold">
                    {connector.title}
                  </span>
                  <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">
                    {connector.description}
                  </span>
                  {connector.helperText ? (
                    <span className="mt-3 block text-sm text-slate-600 dark:text-slate-300">
                      {connector.helperText}
                    </span>
                  ) : null}
                  {isStarting ? (
                    <span className="mt-3 block text-sm font-semibold text-pine dark:text-emerald-300">
                      Starting connection...
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {sync.connectorsQuery.isLoading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Loading connection options.
            </p>
          ) : null}

          {sync.connectorsQuery.isError ? (
            <p className="text-sm text-coral dark:text-orange-300">
              Connection options are unavailable.
            </p>
          ) : null}

          {sync.startProviderConnection.isError ? (
            <p className="text-sm text-coral dark:text-orange-300">
              Could not start the connection flow.
            </p>
          ) : null}

          {sync.syncfyWidgetError ? (
            <p className="text-sm text-coral dark:text-orange-300">
              {sync.syncfyWidgetError}
            </p>
          ) : null}

          {sync.activeConnection && !sync.activeConnection.url ? (
            <p className="text-sm font-semibold text-pine dark:text-emerald-300">
              {sync.activeConnection.widget
                ? "Provider widget opened. Complete the connection there, then refresh discovered accounts."
                : "Connection flow started."}
            </p>
          ) : null}

          <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <p className="font-semibold">Confirm discovered accounts</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Select the accounts, cards, or investment accounts to add to
                  FlowLedger after the provider imports them.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={sync.providerAccountsQuery.isFetching}
                onClick={() => sync.providerAccountsQuery.refetch()}
              >
                Refresh
              </Button>
            </div>

            <div className="mt-3 grid gap-3">
              {(sync.providerAccountsQuery.data ?? []).map((providerAccount) => {
                const isSelected = sync.selectedProviderAccountIds.includes(
                  providerAccount.id
                );

                return (
                  <div
                    key={providerAccount.id}
                    className="grid gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-800 md:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]"
                  >
                    <label className="flex min-w-0 gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0"
                        checked={isSelected}
                        onChange={() =>
                          sync.toggleProviderAccount(providerAccount.id)
                        }
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">
                          {providerAccount.name}
                        </span>
                        <span className="block text-sm capitalize text-slate-500 dark:text-slate-400">
                          {[
                            providerAccount.type.replace("_", " "),
                            providerAccount.currency,
                            providerAccount.institutionName
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {providerAccount.balance !== null &&
                        providerAccount.balance !== undefined ? (
                          <span className="block text-sm font-semibold text-pine dark:text-emerald-300">
                            Balance{" "}
                            {formatMoney(
                              providerAccount.balance,
                              providerAccount.currency ?? "USD"
                            )}
                          </span>
                        ) : null}
                      </span>
                    </label>

                    <SelectField
                      label="FlowLedger account"
                      value={
                        sync.providerAccountLinkTargets[providerAccount.id] ??
                        ""
                      }
                      onChange={(event) =>
                        sync.setProviderAccountLinkTargets((targets) => ({
                          ...targets,
                          [providerAccount.id]: event.target.value
                        }))
                      }
                      disabled={!isSelected}
                    >
                      <option value="">Create new account</option>
                      {(sync.linkableAccountsQuery.data ?? []).map(
                        (account) => (
                          <option key={account.id} value={account.id}>
                            Link to {account.name}
                          </option>
                        )
                      )}
                    </SelectField>
                  </div>
                );
              })}

              {sync.providerAccountsQuery.isLoading ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Waiting for discovered accounts.
                </p>
              ) : null}

              {sync.providerAccountsQuery.isError ? (
                <p className="text-sm text-coral dark:text-orange-300">
                  Could not load discovered accounts.
                </p>
              ) : null}

              {!sync.providerAccountsQuery.isLoading &&
              !sync.providerAccountsQuery.isError &&
              (sync.providerAccountsQuery.data ?? []).length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No discovered accounts yet. Complete the provider flow, then
                  refresh this list.
                </p>
              ) : null}
            </div>

            {(sync.providerAccountsQuery.data ?? []).length > 0 ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  disabled={
                    sync.confirmProviderAccounts.isPending ||
                    sync.selectedProviderAccountIds.length === 0
                  }
                  onClick={() => sync.confirmProviderAccounts.mutate()}
                >
                  Add selected accounts
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    sync.setSelectedProviderAccountIds(
                      (sync.providerAccountsQuery.data ?? []).map(
                        (account) => account.id
                      )
                    )
                  }
                >
                  Select all
                </Button>
              </div>
            ) : null}

            {sync.confirmProviderAccounts.isError ? (
              <p className="mt-3 text-sm text-coral dark:text-orange-300">
                Could not add selected accounts.
              </p>
            ) : null}
          </div>

          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => sync.setAddMode(null)}
              disabled={sync.startProviderConnection.isPending}
            >
              Back
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
