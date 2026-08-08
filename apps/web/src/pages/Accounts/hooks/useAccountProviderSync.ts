import type { AccountType, ProviderConnectionFlow } from "@flowledger/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import * as accountsClient from "../../../services/accounts.client";
import type { Account, AccountSync } from "../../../types/accounts.types";
import type { SyncfyWidgetEntrypoint } from "../types/accounts.types";
import { openSyncfyWidget } from "../utils/syncfyWidget";

/** State and handlers for connecting, resyncing, and reconnecting provider (Syncfy) accounts. */
export function useAccountProviderSync({
  defaultCurrency
}: {
  defaultCurrency: string;
}) {
  const queryClient = useQueryClient();

  const [addMode, setAddMode] = useState<"manual" | "sync" | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("checking");
  const [identifier, setIdentifier] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [initialBalance, setInitialBalance] = useState("0");

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

  const connectorsQuery = useQuery({
    queryKey: ["provider-connectors"],
    queryFn: async () =>
      (await accountsClient.listProviderConnectors()).connectors
  });

  const providerAccountsQuery = useQuery({
    queryKey: ["provider-accounts", "unlinked"],
    queryFn: async () =>
      (await accountsClient.listProviderAccounts({ status: "unlinked" }))
        .accounts,
    enabled: addMode === "sync",
    refetchInterval: activeConnection ? 5000 : false
  });

  // Independent of the browse list's type/source/archive filters — the
  // "link to existing account" dropdown should always offer every active
  // account, not just whatever the page happens to be filtered to.
  const linkableAccountsQuery = useQuery({
    queryKey: ["accounts", "linkable"],
    queryFn: async () =>
      (await accountsClient.listAccounts({ includeArchived: false })).accounts
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

  const createAccount = useMutation({
    mutationFn: () =>
      accountsClient.createAccount({
        name,
        type,
        identifier: identifier || null,
        currency,
        initialBalance: Number(initialBalance || 0)
      }),
    onSuccess: async () => {
      setName("");
      setIdentifier("");
      setCurrency(defaultCurrency);
      setInitialBalance("0");
      setAddMode(null);
      setIsFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    }
  });

  const startProviderConnection = useMutation({
    mutationFn: (target: { provider: string }) =>
      accountsClient.createProviderConnection({ provider: target.provider }),
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

  const confirmProviderAccounts = useMutation({
    mutationFn: () =>
      accountsClient.confirmProviderAccounts(
        selectedProviderAccountIds.map((providerAccountId) => ({
          providerAccountId,
          accountId: providerAccountLinkTargets[providerAccountId] || undefined
        }))
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
      const { connection } = await accountsClient.createProviderConnection({
        provider: input.sync.provider
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

      const { refresh } = await accountsClient.refreshSyncfyCredential(
        input.sync.providerCredentialId
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

  function closeForm() {
    setName("");
    setType("checking");
    setIdentifier("");
    setCurrency(defaultCurrency);
    setInitialBalance("0");
    setAddMode(null);
    setSelectedConnectorId(null);
    setActiveConnection(null);
    setSyncfyWidgetError(null);
    setSelectedProviderAccountIds([]);
    setProviderAccountLinkTargets({});
    setIsFormOpen(false);
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

  return {
    addMode,
    setAddMode,
    isFormOpen,
    setIsFormOpen,
    name,
    setName,
    type,
    setType,
    identifier,
    setIdentifier,
    currency,
    setCurrency,
    initialBalance,
    setInitialBalance,
    selectedConnectorId,
    setSelectedConnectorId,
    activeConnection,
    setActiveConnection,
    syncfyWidgetError,
    setSyncfyWidgetError,
    resyncMessages,
    selectedProviderAccountIds,
    setSelectedProviderAccountIds,
    providerAccountLinkTargets,
    setProviderAccountLinkTargets,
    connectorsQuery,
    providerAccountsQuery,
    linkableAccountsQuery,
    createAccount,
    startProviderConnection,
    confirmProviderAccounts,
    startProviderCredentialFlow,
    closeForm,
    toggleProviderAccount,
    startSyncedCredentialFlow
  };
}
