import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AddRecordButton } from "../../components/AddRecordButton";
import { Card } from "../../components/Card";
import { PageHeader } from "../../components/PageHeader";
import { groupByFields } from "../../utils/groupByFields";
import { SearchBar, type SearchBarQuery } from "../../components/SearchBar";
import {
  createConditionWithValue,
  createEmptyGroup
} from "../../utils/searchDomain";
import { useAuth } from "../../hooks/useAuth";
import * as accountsClient from "../../services/accounts.client";
import { AccountListItem } from "./components/AccountListItem";
import { AddAccountCard } from "./components/AddAccountCard";
import { BankSyncUnavailableNotice } from "./components/UnavailableActionTooltip";
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

const accountGroupByDefsForBucketing = ACCOUNT_GROUPABLE_FIELDS.map(
  (field) => ({
    id: field.name,
    label: field.label
  })
);

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

/** Accounts list page: search/filter/group controls, and provider sync widget; rows link to the account view. */
export function AccountsPage() {
  const auth = useAuth();

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

  const sync = useAccountProviderSync({
    defaultCurrency: auth.user?.preferredCurrency || "USD"
  });

  const visibleAccounts = useMemo(
    () => accountsQuery.data ?? [],
    [accountsQuery.data]
  );
  const activeGroupBys = useMemo(
    () => accountQuery.groupBy ?? [],
    [accountQuery.groupBy]
  );
  const groupedAccounts = useMemo(
    () =>
      groupByFields(
        visibleAccounts,
        activeGroupBys,
        accountGroupByDefsForBucketing,
        accountGroupKey
      ),
    [visibleAccounts, activeGroupBys]
  );

  return (
    <div className="grid gap-6">
      <AddAccountCard sync={sync} />

      {sync.isBankSyncUnavailable ? <BankSyncUnavailableNotice /> : null}

      <Card>
        <PageHeader
          title="Accounts"
          action={
            <AddRecordButton
              label="account"
              onClick={() => {
                sync.setAddMode(null);
                sync.setIsFormOpen(true);
              }}
            />
          }
        >
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
        </PageHeader>

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
                    preferredCurrency={auth.user?.preferredCurrency}
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
