import type { AccountType } from "@flowledger/shared";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "../../components/Card";
import { useAuth } from "../../hooks/useAuth";
import * as accountsClient from "../../services/accounts.client";
import type { AccountSortBy } from "../../services/accounts.client";
import { matchesSearch } from "../../utils/search";
import {
  AccountsFiltersCard,
  accountGroupByDefs,
  accountGroupKey,
  groupByFields
} from "./components/AccountsFiltersCard";
import { AccountListItem } from "./components/AccountListItem";
import { AddAccountCard } from "./components/AddAccountCard";
import { useAccountEditForm } from "./hooks/useAccountEditForm";
import { useAccountProviderSync } from "./hooks/useAccountProviderSync";
import "@syncfy/authentication-widget/dist/syncfy-authentication-widget.css";

/** Accounts list page: search/filter/group controls, provider sync widget, and inline edit forms. */
export function AccountsPage() {
  const auth = useAuth();

  const [archiveMode, setArchiveMode] = useState<"active" | "archived">(
    "active"
  );
  const [search, setSearch] = useState("");
  const [typeFilterValues, setTypeFilterValues] = useState<string[]>([]);
  const [sourceFilterValues, setSourceFilterValues] = useState<string[]>([]);
  const [groupBys, setGroupBys] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<AccountSortBy>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [expandedAccountIds, setExpandedAccountIds] = useState<Set<string>>(
    new Set()
  );

  function toggleAccountExpanded(accountId: string) {
    setExpandedAccountIds((current) => {
      const next = new Set(current);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  }

  const accountsQuery = useQuery({
    queryKey: [
      "accounts",
      archiveMode,
      sortBy,
      sortDirection,
      typeFilterValues,
      sourceFilterValues
    ],
    queryFn: async () =>
      (
        await accountsClient.listAccounts({
          includeArchived: archiveMode === "archived",
          sortBy,
          sortDirection,
          types: typeFilterValues as AccountType[],
          sources: sourceFilterValues as ("manual" | "synced")[]
        })
      ).accounts
  });

  const sync = useAccountProviderSync({
    defaultCurrency: auth.user?.preferredCurrency || "USD"
  });
  const editForm = useAccountEditForm();

  const visibleAccounts = useMemo(() => {
    return (accountsQuery.data ?? []).filter((account) =>
      matchesSearch(
        [
          account.name,
          account.type,
          account.identifier,
          account.source,
          ...(account.sync ?? []).flatMap((accountSync) => [
            accountSync.provider,
            accountSync.institutionName,
            accountSync.accountName,
            accountSync.status,
            accountSync.connectionStatus,
            accountSync.failureReason
          ])
        ],
        search
      )
    );
  }, [accountsQuery.data, search]);

  const groupedAccounts = useMemo(
    () =>
      groupByFields(visibleAccounts, groupBys, accountGroupByDefs, accountGroupKey),
    [visibleAccounts, groupBys]
  );

  return (
    <div className="grid gap-6">
      <AddAccountCard sync={sync} />

      <Card>
        <h2 className="text-lg font-semibold">Accounts</h2>
        <div className="mt-4">
          <AccountsFiltersCard
            search={search}
            onSearchChange={setSearch}
            typeFilterValues={typeFilterValues}
            onTypeFilterValuesChange={setTypeFilterValues}
            sourceFilterValues={sourceFilterValues}
            onSourceFilterValuesChange={setSourceFilterValues}
            groupBys={groupBys}
            onGroupBysChange={setGroupBys}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSortByChange={setSortBy}
            onSortDirectionChange={setSortDirection}
            archiveMode={archiveMode}
            onArchiveModeChange={setArchiveMode}
          />
        </div>

        <div className="mt-4 grid gap-4">
          {groupedAccounts.map((section) => (
            <div key={section.key || "all"} className="grid gap-3">
              {section.label ? (
                <h3 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">
                  {section.label}
                </h3>
              ) : null}
              <div className="grid gap-3">
                {section.items.map((account) => (
                  <AccountListItem
                    key={account.id}
                    account={account}
                    editForm={editForm}
                    preferredCurrency={auth.user?.preferredCurrency}
                    isExpanded={expandedAccountIds.has(account.id)}
                    onToggleExpanded={() => toggleAccountExpanded(account.id)}
                    resyncMessages={sync.resyncMessages}
                    isStartingCredentialFlow={
                      sync.startProviderCredentialFlow.isPending
                    }
                    hasCredentialFlowError={
                      sync.startProviderCredentialFlow.isError
                    }
                    onResync={(syncId) =>
                      sync.startSyncedCredentialFlow(
                        account,
                        syncId,
                        "credential"
                      )
                    }
                    onReconnect={(syncId) =>
                      sync.startSyncedCredentialFlow(
                        account,
                        syncId,
                        "updateCredential"
                      )
                    }
                  />
                ))}
              </div>
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
