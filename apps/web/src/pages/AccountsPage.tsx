import { ACCOUNT_TYPES } from "@flowledger/shared";
import type { AccountType, ProviderConnectionFlow } from "@flowledger/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { SelectField, TextInput } from "../components/FormField";
import { SearchComponent } from "../components/SearchComponent";
import { apiRequest } from "../services/api";
import type {
  Account,
  AccountSync,
  Connector,
  ProviderImportedAccount
} from "../types/api";
import { applyCollectionControls, dateSortValue } from "../utils/search";
import "@syncfy/authentication-widget/dist/syncfy-authentication-widget.css";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short"
});

type SyncfyWidgetConstructor = new (params: {
  token: string;
  element: string;
  config: Record<string, unknown>;
}) => {
  open: () => void;
  on?: (eventName: string, callback: (...args: unknown[]) => void) => void;
  setEntrypointCredential?: (idCredential: string) => void;
  setEntrypointUpdateCredential?: (idCredential: string) => void;
};

type SyncfyWidgetEntrypoint =
  | { type: "connect" }
  | { type: "credential"; idCredential: string }
  | { type: "updateCredential"; idCredential: string };

type SyncfyWidgetResult =
  | { event: "success" | "updated" | "closed"; credential?: unknown }
  | { event: "error" | "socket-error" | "api-error"; credential?: unknown };

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function safeSyncfyCredentialSummary(credential: unknown) {
  const record = getRecord(credential);

  return {
    idCredential: getString(record.id_credential),
    status: getString(record.status),
    ws: getString(record.ws),
    isNew:
      typeof record.is_new === "boolean" || typeof record.is_new === "number"
        ? record.is_new
        : undefined,
    twofa:
      typeof record.twofa === "boolean" || typeof record.twofa === "number"
        ? record.twofa
        : undefined,
    hasUsername: Boolean(getString(record.username))
  };
}

function resetSyncfyWidgetContainer() {
  const existing = document.getElementById("widget");
  existing?.remove();

  const element = document.createElement("div");
  element.id = "widget";
  document.body.appendChild(element);

  return element;
}

async function openSyncfyWidget(
  widget: NonNullable<ProviderConnectionFlow["widget"]>,
  options: {
    entrypoint?: SyncfyWidgetEntrypoint;
    onSettled?: () => void | Promise<void>;
    onError?: (message: string) => void;
  } = {}
): Promise<SyncfyWidgetResult> {
  const syncfyGlobal = globalThis as typeof globalThis & {
    global?: typeof globalThis;
  };

  if (typeof syncfyGlobal.global === "undefined") {
    syncfyGlobal.global = globalThis;
  }

  resetSyncfyWidgetContainer();

  // const module = (await import("@syncfy/authentication-widget")) as {
  //   default: SyncfyWidgetConstructor;
  // };
  const module = (await import("@syncfy/authentication-widget/umd")) as {
    default: SyncfyWidgetConstructor;
  };
  
  return await new Promise<SyncfyWidgetResult>((resolve, reject) => {
    let completed = false;
    const syncfyWidget = new module.default({
      token: widget.token,
      element: "#widget",
      config: widget.config
    });

    const settle = (result: SyncfyWidgetResult) => {
      if (completed) return;
      completed = true;

      console.info("[SYNCFY WIDGET] Event", {
        event: result.event,
        credential: safeSyncfyCredentialSummary(result.credential)
      });
      void options.onSettled?.();
      resolve(result);
    };
    const fail = (
      event: "error" | "socket-error" | "api-error",
      message: string,
      credential?: unknown
    ) => {
      options.onError?.(message);
      settle({ event, credential });
    };

    syncfyWidget.on?.("success", (credential) =>
      settle({ event: "success", credential })
    );
    syncfyWidget.on?.("updated", (credential) =>
      settle({ event: "updated", credential })
    );
    syncfyWidget.on?.("closed", (credential) =>
      settle({ event: "closed", credential })
    );
    syncfyWidget.on?.("status", (status) => {
      console.info("[SYNCFY WIDGET] Status", {
        credential: safeSyncfyCredentialSummary(status)
      });
    });

    syncfyWidget.on?.("error", (credential) =>
      fail(
        "error",
        "Syncfy reported an error while processing the credential.",
        credential
      )
    );

    syncfyWidget.on?.("socket-error", (socketError) =>
      fail(
        "socket-error",
        "Syncfy connection failed while processing the credential.",
        socketError
      )
    );

    syncfyWidget.on?.("api-error", (_statusCode, apiError) =>
      fail(
        "api-error",
        "Syncfy API returned an error while processing the credential.",
        apiError
      )
    );

    try {
      if (options.entrypoint?.type === "credential") {
        if (!syncfyWidget.setEntrypointCredential) {
          throw new Error("Syncfy credential resync is unavailable.");
        }
        syncfyWidget.setEntrypointCredential(options.entrypoint.idCredential);
      } else if (options.entrypoint?.type === "updateCredential") {
        if (!syncfyWidget.setEntrypointUpdateCredential) {
          throw new Error("Syncfy credential update is unavailable.");
        }
        syncfyWidget.setEntrypointUpdateCredential(
          options.entrypoint.idCredential
        );
      } else {
        syncfyWidget.open();
      }
    } catch (error) {
      reject(error);
    }

    // Fallback cleanup: when user closes the widget with X,
    // Syncfy hides/removes UI but may leave Vue mounted.
    const observer = new MutationObserver(() => {
      const widgetElement = document.getElementById("widget");

      if (!widgetElement) {
        observer.disconnect();
        resetSyncfyWidgetContainer();
        return;
      }

      const hasVisibleWidgetContent = widgetElement.children.length > 0;

      if (!hasVisibleWidgetContent) {
        observer.disconnect();
        resetSyncfyWidgetContainer();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Never";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : dateTime.format(date);
}

function formatStatus(value: string | null | undefined) {
  return value ? value.replace("_", " ") : "unknown";
}

export function AccountsPage() {
  const queryClient = useQueryClient();

  const [addMode, setAddMode] = useState<"manual" | "sync" | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("checking");
  const [identifier, setIdentifier] = useState("");
  const [initialBalance, setInitialBalance] = useState("0");

  const [archiveMode, setArchiveMode] = useState<"active" | "archived">(
    "active"
  );
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "manual" | "synced">(
    "all"
  );
  const [sortBy, setSortBy] = useState("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(
    null
  );
  const [activeConnection, setActiveConnection] =
    useState<ProviderConnectionFlow | null>(null);
  const [syncfyWidgetError, setSyncfyWidgetError] = useState<string | null>(
    null
  );
  const [resyncMessages, setResyncMessages] = useState<Record<string, string>>(
    {}
  );

  const [selectedProviderAccountIds, setSelectedProviderAccountIds] = useState<
    string[]
  >([]);
  const [providerAccountLinkTargets, setProviderAccountLinkTargets] = useState<
    Record<string, string>
  >({});

  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<AccountType>("checking");
  const [editIdentifier, setEditIdentifier] = useState("");
  const [editInitialBalance, setEditInitialBalance] = useState("0");

  const accountsQuery = useQuery({
    queryKey: ["accounts", archiveMode],
    queryFn: async () =>
      (
        await apiRequest<{ accounts: Account[] }>("/accounts", {
          query: {
            includeArchived: archiveMode === "archived" ? "true" : undefined
          }
        })
      ).accounts
  });

  const connectorsQuery = useQuery({
    queryKey: ["provider-connectors"],
    queryFn: async () =>
      (await apiRequest<{ connectors: Connector[] }>("/providers/connectors"))
        .connectors
  });

  const providerAccountsQuery = useQuery({
    queryKey: ["provider-accounts", "unlinked"],
    queryFn: async () =>
      (
        await apiRequest<{ accounts: ProviderImportedAccount[] }>(
          "/providers/accounts",
          {
            query: { status: "unlinked" }
          }
        )
      ).accounts,
    enabled: addMode === "sync",
    refetchInterval: activeConnection ? 5000 : false
  });

  async function invalidateProviderData() {
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    await queryClient.invalidateQueries({ queryKey: ["provider-accounts"] });
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    await queryClient.invalidateQueries({
      queryKey: ["provider-imported-transactions"]
    });
    await queryClient.invalidateQueries({
      queryKey: ["provider-imported-transactions", "pending-count"]
    });
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    await queryClient.invalidateQueries({
      queryKey: ["notifications", "unread-count"]
    });
  }

  useEffect(() => {
    setSelectedProviderAccountIds((existingIds) => {
      const knownIds = new Set(
        (providerAccountsQuery.data ?? []).map((account) => account.id)
      );
      const keptIds = existingIds.filter((id) => knownIds.has(id));
      const missingIds = (providerAccountsQuery.data ?? [])
        .map((account) => account.id)
        .filter((id) => !keptIds.includes(id));

      return [...keptIds, ...missingIds];
    });
  }, [providerAccountsQuery.data]);

  const visibleAccounts = useMemo(() => {
    return applyCollectionControls(accountsQuery.data ?? [], {
      search,
      searchFields: (account) => [
        account.name,
        account.type,
        account.identifier,
        account.source,
        ...(account.sync ?? []).flatMap((sync) => [
          sync.provider,
          sync.institutionName,
          sync.accountName,
          sync.status,
          sync.connectionStatus,
          sync.failureReason
        ])
      ],
      filters: [
        (account) =>
          archiveMode === "archived" ? account.isArchived : !account.isArchived,
        (account) => (typeFilter ? account.type === typeFilter : true),
        (account) =>
          sourceFilter === "all" ? true : account.source === sourceFilter
      ],
      sortBy,
      sortDirection,
      sorters: {
        name: (account) => account.name,
        createdAt: (account) => dateSortValue(account.createdAt),
        updatedAt: (account) => dateSortValue(account.updatedAt)
      }
    });
  }, [
    accountsQuery.data,
    archiveMode,
    search,
    sortBy,
    sortDirection,
    sourceFilter,
    typeFilter
  ]);

  const createAccount = useMutation({
    mutationFn: () =>
      apiRequest("/accounts", {
        method: "POST",
        body: {
          name,
          type,
          identifier: identifier || null,
          initialBalance: Number(initialBalance || 0)
        }
      }),
    onSuccess: async () => {
      setName("");
      setIdentifier("");
      setInitialBalance("0");
      setAddMode(null);
      setIsFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    }
  });

  const startProviderConnection = useMutation({
    mutationFn: (target: { provider: string }) =>
      apiRequest<{ connection: ProviderConnectionFlow }>(
        "/providers/connections",
        {
          method: "POST",
          body: {
            provider: target.provider
          }
        }
      ),
    onSuccess: async ({ connection }) => {
      setActiveConnection(connection);
      setSyncfyWidgetError(null);
      await providerAccountsQuery.refetch();

      if (connection.url) {
        window.location.assign(connection.url);
        return;
      }

      if (connection.widget) {
        try {
          await openSyncfyWidget(connection.widget, {
            entrypoint: { type: "connect" },
            onSettled: invalidateProviderData,
            onError: setSyncfyWidgetError
          });
        } catch {
          setSyncfyWidgetError("Could not load the Syncfy widget.");
        }
      }
    }
  });

  const updateAccount = useMutation({
    mutationFn: (account: {
      id: string;
      name: string;
      type: AccountType;
      identifier: string;
      initialBalance: number;
    }) =>
      apiRequest(`/accounts/${account.id}`, {
        method: "PUT",
        body: {
          name: account.name,
          type: account.type,
          identifier: account.identifier || null,
          initialBalance: account.initialBalance
        }
      }),
    onSuccess: async () => {
      closeEditForm();
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  const archiveAccount = useMutation({
    mutationFn: (accountId: string) =>
      apiRequest(`/accounts/${accountId}/archive`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    }
  });

  const restoreAccount = useMutation({
    mutationFn: (accountId: string) =>
      apiRequest(`/accounts/${accountId}/restore`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    }
  });

  const deleteAccount = useMutation({
    mutationFn: (accountId: string) =>
      apiRequest(`/accounts/${accountId}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  const confirmProviderAccounts = useMutation({
    mutationFn: () =>
      apiRequest<{ accounts: ProviderImportedAccount[] }>(
        "/providers/accounts/confirm",
        {
          method: "POST",
          body: {
            accounts: selectedProviderAccountIds.map((providerAccountId) => ({
              providerAccountId,
              accountId:
                providerAccountLinkTargets[providerAccountId] || undefined
            }))
          }
        }
      ),
    onSuccess: async () => {
      setSelectedProviderAccountIds([]);
      setProviderAccountLinkTargets({});
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["provider-accounts"] });
    }
  });

  const startProviderCredentialFlow = useMutation({
    mutationFn: async (input: {
      sync: AccountSync;
      entrypoint: Exclude<SyncfyWidgetEntrypoint["type"], "connect">;
    }) => {
      const { connection } = await apiRequest<{
        connection: ProviderConnectionFlow;
      }>("/providers/connections", {
        method: "POST",
        body: {
          provider: input.sync.provider
        }
      });

      if (!connection.widget) {
        throw new Error("Provider widget is unavailable.");
      }

      const widgetResult = await openSyncfyWidget(connection.widget, {
        entrypoint: {
          type: input.entrypoint,
          idCredential: input.sync.providerCredentialId
        },
        onSettled: invalidateProviderData,
        onError: setSyncfyWidgetError
      });

      const { refresh } = await apiRequest<{
        refresh: {
          status: string;
          importedAccounts: number;
          importedTransactions: number;
          requiresManualReconnect?: boolean;
          failureReason?: string;
        };
      }>(
        `/providers/syncfy/credentials/${encodeURIComponent(
          input.sync.providerCredentialId
        )}/refresh`,
        { method: "POST" }
      );

      return { ...input, refresh, widgetResult };
    },
    onSuccess: async ({ sync, entrypoint, refresh, widgetResult }) => {
      const flowLabel = entrypoint === "credential" ? "Resync" : "Reconnect";
      const eventLabel =
        widgetResult.event === "error" ||
        widgetResult.event === "socket-error" ||
        widgetResult.event === "api-error"
          ? "reported an error, but fallback refresh"
          : `${widgetResult.event} refresh`;

      setResyncMessages((messages) => ({
        ...messages,
        [sync.id]: refresh.requiresManualReconnect
          ? (refresh.failureReason ?? "Manual reconnect is required.")
          : `${flowLabel} ${eventLabel} complete. ${
              refresh.importedAccounts
            } account${
              refresh.importedAccounts === 1 ? "" : "s"
            } and ${refresh.importedTransactions} imported transaction${
              refresh.importedTransactions === 1 ? "" : "s"
            } refreshed.`
      }));
      await invalidateProviderData();
    },
    onError: (_error, { sync }) => {
      setResyncMessages((messages) => ({
        ...messages,
        [sync.id]: "Could not start the Syncfy credential flow."
      }));
    }
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    await createAccount.mutateAsync();
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingAccountId) return;

    await updateAccount.mutateAsync({
      id: editingAccountId,
      name: editName,
      type: editType,
      identifier: editIdentifier,
      initialBalance: Number(editInitialBalance || 0)
    });
  }

  function closeForm() {
    setName("");
    setType("checking");
    setIdentifier("");
    setInitialBalance("0");
    setAddMode(null);
    setSelectedConnectorId(null);
    setActiveConnection(null);
    setSyncfyWidgetError(null);
    setSelectedProviderAccountIds([]);
    setProviderAccountLinkTargets({});
    setIsFormOpen(false);
  }

  function openEditForm(account: Account) {
    setEditingAccountId(account.id);
    setEditName(account.name);
    setEditType(account.type);
    setEditIdentifier(account.identifier ?? "");
    setEditInitialBalance(String(account.initialBalance ?? 0));
  }

  function closeEditForm() {
    setEditingAccountId(null);
    setEditName("");
    setEditType("checking");
    setEditIdentifier("");
    setEditInitialBalance("0");
  }

  async function confirmDelete(account: Account) {
    const confirmed = window.confirm(
      `Delete "${account.name}" permanently? This cannot be undone. Related financial data may also be deleted or disconnected from this account.`
    );
    if (!confirmed) return;
    await deleteAccount.mutateAsync(account.id);
  }

  function toggleProviderAccount(providerAccountId: string) {
    setSelectedProviderAccountIds((accountIds) =>
      accountIds.includes(providerAccountId)
        ? accountIds.filter((accountId) => accountId !== providerAccountId)
        : [...accountIds, providerAccountId]
    );
  }

  function startSyncedCredentialFlow(
    account: Account,
    syncId: string,
    entrypoint: Exclude<SyncfyWidgetEntrypoint["type"], "connect">
  ) {
    const sync = account.sync?.find((item) => item.id === syncId);
    if (!sync?.provider || !sync.providerCredentialId) return;

    setIsFormOpen(true);
    setAddMode("sync");
    setSelectedConnectorId(`connector:${sync.provider}`);
    setActiveConnection(null);
    setSyncfyWidgetError(null);

    startProviderCredentialFlow.mutate({ sync, entrypoint });
  }

  return (
    <div className="grid gap-6">
      <Card>
        {isFormOpen ? (
          <>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <h2 className="text-lg font-semibold">
                {addMode === "manual"
                  ? "New manual account"
                  : addMode === "sync"
                    ? "Sync accounts"
                    : "Add account"}
              </h2>
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={closeForm}
              >
                Cancel
              </Button>
            </div>

            {addMode === null ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  className="rounded-md border border-slate-200 p-4 text-left transition hover:border-pine hover:bg-slate-50 dark:border-slate-800 dark:hover:border-emerald-700 dark:hover:bg-slate-900"
                  onClick={() => setAddMode("manual")}
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
                  onClick={() => setAddMode("sync")}
                >
                  <p className="font-semibold">Sync accounts</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Choose a provider. The provider widget will open so you can
                    select and connect your institution securely.
                  </p>
                </button>
              </div>
            ) : null}

            {addMode === "manual" ? (
              <form
                className="mt-4 grid gap-4 md:grid-cols-4"
                onSubmit={submit}
              >
                <TextInput
                  label="Name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
                <SelectField
                  label="Type"
                  value={type}
                  onChange={(event) =>
                    setType(event.target.value as AccountType)
                  }
                >
                  {ACCOUNT_TYPES.map((item) => (
                    <option key={item} value={item}>
                      {item.replace("_", " ")}
                    </option>
                  ))}
                </SelectField>
                <TextInput
                  label="Identifier"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                />
                <TextInput
                  label="Initial balance"
                  type="number"
                  step="0.01"
                  value={initialBalance}
                  onChange={(event) => setInitialBalance(event.target.value)}
                />
                <div className="flex flex-col gap-2 md:col-span-4 sm:flex-row">
                  <Button type="submit" disabled={createAccount.isPending}>
                    Save account
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setAddMode(null)}
                  >
                    Back
                  </Button>
                </div>
              </form>
            ) : null}

            {addMode === "sync" ? (
              <div className="mt-4 grid gap-4">
                <div className="grid gap-3 md:grid-cols-2">
                  {(connectorsQuery.data ?? []).map((connector) => {
                    const connectorKey = `connector:${connector.provider}:${connector.connectorId}`;
                    const isStarting =
                      selectedConnectorId === connectorKey &&
                      startProviderConnection.isPending;

                    return (
                      <button
                        key={connectorKey}
                        type="button"
                        className="rounded-md border border-slate-200 p-4 text-left transition hover:border-pine hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:hover:border-emerald-700 dark:hover:bg-slate-900"
                        disabled={startProviderConnection.isPending}
                        onClick={() => {
                          setSelectedConnectorId(connectorKey);
                          setActiveConnection(null);
                          setSyncfyWidgetError(null);
                          startProviderConnection.mutate({
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

                {connectorsQuery.isLoading ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Loading connection options.
                  </p>
                ) : null}

                {connectorsQuery.isError ? (
                  <p className="text-sm text-coral dark:text-orange-300">
                    Connection options are unavailable.
                  </p>
                ) : null}

                {startProviderConnection.isError ? (
                  <p className="text-sm text-coral dark:text-orange-300">
                    Could not start the connection flow.
                  </p>
                ) : null}

                {syncfyWidgetError ? (
                  <p className="text-sm text-coral dark:text-orange-300">
                    {syncfyWidgetError}
                  </p>
                ) : null}

                {activeConnection && !activeConnection.url ? (
                  <p className="text-sm font-semibold text-pine dark:text-emerald-300">
                    {activeConnection.widget
                      ? "Provider widget opened. Complete the connection there, then refresh discovered accounts."
                      : "Connection flow started."}
                  </p>
                ) : null}

                <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
                  <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                    <div>
                      <p className="font-semibold">
                        Confirm discovered accounts
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Select the accounts, cards, or investment accounts to
                        add to FlowLedger after the provider imports them.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={providerAccountsQuery.isFetching}
                      onClick={() => providerAccountsQuery.refetch()}
                    >
                      Refresh
                    </Button>
                  </div>

                  <div className="mt-3 grid gap-3">
                    {(providerAccountsQuery.data ?? []).map(
                      (providerAccount) => {
                        const isSelected = selectedProviderAccountIds.includes(
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
                                  toggleProviderAccount(providerAccount.id)
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
                                    {money.format(providerAccount.balance)}
                                  </span>
                                ) : null}
                              </span>
                            </label>

                            <SelectField
                              label="FlowLedger account"
                              value={
                                providerAccountLinkTargets[
                                  providerAccount.id
                                ] ?? ""
                              }
                              onChange={(event) =>
                                setProviderAccountLinkTargets((targets) => ({
                                  ...targets,
                                  [providerAccount.id]: event.target.value
                                }))
                              }
                              disabled={!isSelected}
                            >
                              <option value="">Create new account</option>
                              {(accountsQuery.data ?? [])
                                .filter((account) => !account.isArchived)
                                .map((account) => (
                                  <option key={account.id} value={account.id}>
                                    Link to {account.name}
                                  </option>
                                ))}
                            </SelectField>
                          </div>
                        );
                      }
                    )}

                    {providerAccountsQuery.isLoading ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Waiting for discovered accounts.
                      </p>
                    ) : null}

                    {providerAccountsQuery.isError ? (
                      <p className="text-sm text-coral dark:text-orange-300">
                        Could not load discovered accounts.
                      </p>
                    ) : null}

                    {!providerAccountsQuery.isLoading &&
                    !providerAccountsQuery.isError &&
                    (providerAccountsQuery.data ?? []).length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        No discovered accounts yet. Complete the provider flow,
                        then refresh this list.
                      </p>
                    ) : null}
                  </div>

                  {(providerAccountsQuery.data ?? []).length > 0 ? (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        disabled={
                          confirmProviderAccounts.isPending ||
                          selectedProviderAccountIds.length === 0
                        }
                        onClick={() => confirmProviderAccounts.mutate()}
                      >
                        Add selected accounts
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          setSelectedProviderAccountIds(
                            (providerAccountsQuery.data ?? []).map(
                              (account) => account.id
                            )
                          )
                        }
                      >
                        Select all
                      </Button>
                    </div>
                  ) : null}

                  {confirmProviderAccounts.isError ? (
                    <p className="mt-3 text-sm text-coral dark:text-orange-300">
                      Could not add selected accounts.
                    </p>
                  ) : null}
                </div>

                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setAddMode(null)}
                    disabled={startProviderConnection.isPending}
                  >
                    Back
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => {
              setAddMode(null);
              setIsFormOpen(true);
            }}
          >
            Add account
          </Button>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Accounts</h2>
        <div className="mt-4">
          <SearchComponent
            searchValue={search}
            searchPlaceholder="Search accounts"
            onSearchChange={setSearch}
            filters={[
              {
                id: "type",
                label: "Type",
                value: typeFilter,
                onChange: setTypeFilter,
                options: [
                  { label: "All types", value: "" },
                  ...ACCOUNT_TYPES.map((item) => ({
                    label: item.replace("_", " "),
                    value: item
                  }))
                ]
              },
              {
                id: "source",
                label: "Source",
                value: sourceFilter,
                onChange: (value) =>
                  setSourceFilter(value as "all" | "manual" | "synced"),
                options: [
                  { label: "All sources", value: "all" },
                  { label: "Manual", value: "manual" },
                  { label: "Synced", value: "synced" }
                ]
              }
            ]}
            sort={{
              value: sortBy,
              direction: sortDirection,
              onChange: setSortBy,
              onDirectionChange: setSortDirection,
              options: [
                { label: "Name", value: "name" },
                { label: "Created date", value: "createdAt" },
                { label: "Updated date", value: "updatedAt" }
              ]
            }}
            archiveToggle={{
              value: archiveMode,
              onChange: setArchiveMode
            }}
          />
        </div>

        <div className="mt-4 grid gap-3">
          {visibleAccounts.map((account) => (
            <div
              key={account.id}
              className="rounded-md border border-slate-200 p-3 dark:border-slate-800"
            >
              {editingAccountId === account.id ? (
                <form className="grid gap-3" onSubmit={submitEdit}>
                  <TextInput
                    label="Name"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    required
                  />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <SelectField
                      label="Type"
                      value={editType}
                      onChange={(event) =>
                        setEditType(event.target.value as AccountType)
                      }
                    >
                      {ACCOUNT_TYPES.map((item) => (
                        <option key={item} value={item}>
                          {item.replace("_", " ")}
                        </option>
                      ))}
                    </SelectField>
                    <TextInput
                      label="Identifier"
                      value={editIdentifier}
                      onChange={(event) =>
                        setEditIdentifier(event.target.value)
                      }
                    />
                    <TextInput
                      label="Initial balance"
                      type="number"
                      step="0.01"
                      value={editInitialBalance}
                      onChange={(event) =>
                        setEditInitialBalance(event.target.value)
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="submit" disabled={updateAccount.isPending}>
                      Save changes
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={closeEditForm}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="grid gap-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{account.name}</p>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {account.source === "synced" ? "Synced" : "Manual"}
                        </span>
                        {account.isArchived ? (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            Archived
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm capitalize text-slate-500 dark:text-slate-400">
                        {account.type.replace("_", " ")}
                      </p>
                      <p
                        className={`text-sm font-semibold ${
                          (account.currentBalance ?? 0) >= 0
                            ? "text-pine dark:text-emerald-300"
                            : "text-coral dark:text-orange-300"
                        }`}
                      >
                        FlowLedger balance{" "}
                        {money.format(account.currentBalance ?? 0)}
                      </p>
                      {account.identifier ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {account.identifier}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => openEditForm(account)}
                      >
                        Edit
                      </Button>
                      {account.isArchived ? (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={restoreAccount.isPending}
                          onClick={() => restoreAccount.mutate(account.id)}
                        >
                          Restore
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={archiveAccount.isPending}
                          onClick={() => archiveAccount.mutate(account.id)}
                        >
                          Archive
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="danger"
                        disabled={deleteAccount.isPending}
                        onClick={() => confirmDelete(account)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  {account.source === "synced" && account.sync?.length ? (
                    <div className="grid gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                      {account.sync.map((sync) => (
                        <div
                          key={sync.id}
                          className="grid gap-3 rounded-md bg-slate-50 p-3 dark:bg-slate-900 md:grid-cols-[minmax(0,1fr)_auto]"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold capitalize">
                                {sync.provider}
                              </p>
                              <span className="rounded bg-white px-2 py-0.5 text-xs font-semibold capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {formatStatus(sync.status)}
                              </span>
                              {sync.connectionStatus ? (
                                <span className="rounded bg-white px-2 py-0.5 text-xs font-semibold capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  Connection{" "}
                                  {formatStatus(sync.connectionStatus)}
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
                                    ? money.format(sync.externalBalance)
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
                              disabled={
                                startProviderCredentialFlow.isPending ||
                                account.isArchived
                              }
                              onClick={() =>
                                startSyncedCredentialFlow(
                                  account,
                                  sync.id,
                                  "credential"
                                )
                              }
                            >
                              Resync
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={
                                startProviderCredentialFlow.isPending ||
                                account.isArchived ||
                                !sync.provider ||
                                !sync.providerCredentialId
                              }
                              onClick={() =>
                                startSyncedCredentialFlow(
                                  account,
                                  sync.id,
                                  "updateCredential"
                                )
                              }
                            >
                              Reconnect
                            </Button>
                          </div>
                        </div>
                      ))}

                      {startProviderCredentialFlow.isError ? (
                        <p className="text-sm text-coral dark:text-orange-300">
                          Could not start the selected Syncfy credential flow.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))}

          {visibleAccounts.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No accounts found.
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
