import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/Button";
import { AddRecordButton } from "../../components/AddRecordButton";
import { ListView } from "../../components/ListView";
import { groupByFields } from "../../utils/groupByFields";
import { SearchBar, type SearchBarQuery } from "../../components/SearchBar";
import {
  createConditionWithValue,
  createEmptyGroup
} from "../../utils/searchDomain";
import { routes } from "../../constants/routes";
import { useAuth } from "../../hooks/useAuth";
import * as accountsClient from "../../services/accounts.client";
import { AccountListItem } from "./components/AccountListItem";
import { SyncAccountsCard } from "./components/SyncAccountsCard";
import {
  BankSyncUnavailableNotice,
  UnavailableActionTooltip
} from "./components/UnavailableActionTooltip";
import { useAccountProviderSync } from "./hooks/useAccountProviderSync";
import type { Account } from "../../types/accounts.types";
import { getAccountTypeLabel } from "./utils/accountDisplay";
import {
  ACCOUNT_DEFAULT_SEARCH_FIELD,
  ACCOUNT_GROUPABLE_FIELDS,
  ACCOUNT_SORTABLE_FIELDS,
  buildAccountSearchFields
} from "./utils/accountSearchFields";
import "@syncfy/authentication-widget/dist/syncfy-authentication-widget.css";

// Archived accounts are excluded by default — same default the old
// dedicated Active/Archived toggle had — but expressed as an ordinary,
// visible, removable FilterBuilder condition instead of hidden logic.
const initialAccountDomain = {
  ...createEmptyGroup("and"),
  children: [createConditionWithValue("isArchived", "=", "false")]
};

function accountGroupKey(account: Account, groupById: string) {
  if (groupById === "type") {
    return { key: account.type, label: getAccountTypeLabel(account.type) };
  }
  if (groupById === "source") {
    const source = account.source ?? "manual";
    return { key: source, label: source === "synced" ? "Synced" : "Manual" };
  }
  return { key: "", label: "" };
}

/** Accounts list page: search/filter/group controls, "Add account" (opens the `/accounts/new` Form View) and "Sync accounts" (provider sync panel); rows link to the account view. */
export function AccountsPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  const [accountQuery, setAccountQuery] = useState<SearchBarQuery>({});
  const accountSearchFields = useMemo(() => buildAccountSearchFields(), []);

  const accountsQuery = useQuery({
    queryKey: ["accounts", accountQuery],
    queryFn: async () =>
      (
        await accountsClient.listAccounts({
          where: accountQuery.where,
          sort: accountQuery.sort
        })
      ).accounts
  });

  const sync = useAccountProviderSync();

  const visibleAccounts = useMemo(
    () => accountsQuery.data ?? [],
    [accountsQuery.data]
  );
  const groupedAccounts = useMemo(
    () => groupByFields(visibleAccounts, accountQuery.groupBy, accountGroupKey),
    [visibleAccounts, accountQuery.groupBy]
  );

  return (
    <div className="grid gap-6">
      <SyncAccountsCard sync={sync} />

      {sync.isBankSyncUnavailable ? <BankSyncUnavailableNotice /> : null}

      <ListView
        title="Accounts"
        actions={
          <>
            <UnavailableActionTooltip unavailable={sync.isBankSyncUnavailable}>
              {(a11y) => (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 shrink-0 whitespace-nowrap"
                  onClick={
                    sync.isBankSyncUnavailable
                      ? undefined
                      : () => sync.setIsFormOpen(true)
                  }
                  {...a11y}
                >
                  Sync accounts
                </Button>
              )}
            </UnavailableActionTooltip>
            <AddRecordButton
              label="account"
              onClick={() => navigate(routes.newAccount)}
            />
          </>
        }
        toolbar={
          <SearchBar
            fields={accountSearchFields}
            groupableFields={ACCOUNT_GROUPABLE_FIELDS}
            sortableFields={ACCOUNT_SORTABLE_FIELDS}
            defaultSearchField={ACCOUNT_DEFAULT_SEARCH_FIELD}
            initialSort={{ field: "name", direction: "asc" }}
            initialDomain={initialAccountDomain}
            placeholder="Search accounts"
            onQueryChange={setAccountQuery}
          />
        }
        items={visibleAccounts}
        groups={groupedAccounts}
        rowKey={(account) => account.id}
        renderItem={(account) => (
          <AccountListItem
            account={account}
            preferredCurrency={auth.user?.preferredCurrency}
          />
        )}
        isLoading={accountsQuery.isLoading}
        error={accountsQuery.error?.message}
        emptyText="No accounts found."
      />
    </div>
  );
}
