import { ACCOUNT_TYPES } from "@flowledger/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ActionMenuItem } from "../../components/ActionMenu";
import { Card } from "../../components/Card";
import { CurrencySelect } from "../../components/CurrencySelect";
import {
  EditableField,
  editableControlClassName
} from "../../components/EditableField";
import { FormView } from "../../components/FormView";
import type { FormViewTab } from "../../types/common.types";
import { routes } from "../../constants/routes";
import { RelatedTransactionsList } from "../Transactions/components/RelatedTransactionsList";
import { useAuth } from "../../hooks/useAuth";
import * as accountsClient from "../../services/accounts.client";
import { AccountSyncPanel } from "./components/AccountSyncPanel";
import { AddAccountCard } from "./components/AddAccountCard";
import { AccountTypeSections } from "./components/AccountTypeSections";
import { useAccountActions } from "./hooks/useAccountActions";
import { useAccountForm } from "./hooks/useAccountForm";
import { useAccountProviderSync } from "./hooks/useAccountProviderSync";
import type { AccountDraft } from "./types/accounts.types";
import { getAccountTypeLabel } from "./utils/accountDisplay";
import "@syncfy/authentication-widget/dist/syncfy-authentication-widget.css";

/** Account Form View at `/accounts/:id`: tabs General (editable fields, sync panel) and Transactions (paginated list); archive/restore/delete in the actions menu. Unknown or foreign ids show the same not-found state. */
export function AccountDetailPage() {
  const { id = "" } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();

  const accountsQuery = useQuery({
    queryKey: ["accounts", "all"],
    queryFn: async () => (await accountsClient.listAccounts()).accounts
  });
  const account = accountsQuery.data?.find((item) => item.id === id) ?? null;

  const draft = useAccountForm(account);
  const actions = useAccountActions(id);
  const sync = useAccountProviderSync({
    defaultCurrency: auth.user?.preferredCurrency || "USD"
  });

  if (accountsQuery.isLoading) {
    return <Card>Loading...</Card>;
  }
  if (!account) {
    return (
      <Card>
        <h1 className="text-xl font-semibold">Account not found</h1>
        <Link to={routes.accounts} className="text-pine underline">
          Back to accounts
        </Link>
      </Card>
    );
  }

  function field(key: keyof AccountDraft) {
    return {
      error: draft.fieldErrors[key],
      dirty: draft.changedKeys.includes(key),
      onRevert: () => draft.revertField(key)
    };
  }

  async function confirmDelete() {
    if (!account) return;
    const confirmed = window.confirm(
      `Delete "${account.name}" permanently? This cannot be undone. Related financial data may also be deleted or disconnected from this account.`
    );
    if (!confirmed) return;
    await actions.deleteAccount.mutateAsync();
    navigate(routes.accounts);
  }

  const { values } = draft;

  const tabs: FormViewTab[] = [
    {
      id: "general",
      label: "General",
      content: (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <EditableField label="Name" {...field("name")}>
              <input
                className={editableControlClassName}
                value={values.name}
                onChange={(event) => draft.setField("name", event.target.value)}
              />
            </EditableField>
            <EditableField label="Type" {...field("type")}>
              <select
                className={editableControlClassName}
                value={values.type}
                onChange={(event) =>
                  draft.setField(
                    "type",
                    event.target.value as AccountDraft["type"]
                  )
                }
              >
                {ACCOUNT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {getAccountTypeLabel(type)}
                  </option>
                ))}
              </select>
            </EditableField>
            <EditableField label="Identifier" {...field("identifier")}>
              <input
                className={editableControlClassName}
                value={values.identifier}
                onChange={(event) =>
                  draft.setField("identifier", event.target.value)
                }
              />
            </EditableField>
            <EditableField label="Currency" hideLabel {...field("currency")}>
              <CurrencySelect
                label="Currency"
                value={values.currency}
                onChange={(value) => draft.setField("currency", value)}
                disabled={draft.isSaving}
              />
            </EditableField>
            <EditableField label="Initial balance" {...field("initialBalance")}>
              <input
                className={editableControlClassName}
                type="number"
                step="any"
                value={values.initialBalance}
                onChange={(event) =>
                  draft.setField("initialBalance", event.target.value)
                }
              />
            </EditableField>
          </div>

          <AccountTypeSections type={values.type} draft={draft} />

          <div className="mt-4">
            <AccountSyncPanel
              account={account}
              resyncMessages={sync.resyncMessages}
              isSyncAvailable={
                !sync.connectorsQuery.isSuccess ||
                (account.sync ?? []).every((item) =>
                  sync.availableProviders.has(item.provider)
                )
              }
              isStartingCredentialFlow={
                sync.startProviderCredentialFlow.isPending
              }
              hasCredentialFlowError={sync.startProviderCredentialFlow.isError}
              onResync={(syncId) =>
                sync.startSyncedCredentialFlow(account, syncId, "credential")
              }
              onReconnect={(syncId) =>
                sync.startSyncedCredentialFlow(
                  account,
                  syncId,
                  "updateCredential"
                )
              }
            />
          </div>
        </>
      )
    },
    {
      id: "transactions",
      label: "Transactions",
      content: (
        <RelatedTransactionsList
          key={account.id}
          scope={{ field: "accountId", value: account.id }}
          emptyText="No transactions for this account yet."
        />
      )
    }
  ];

  return (
    <div className="grid gap-6">
      <AddAccountCard sync={sync} />
      <Card>
        <FormView
          title={account.name}
          subtitle={`${getAccountTypeLabel(account.type)}${account.isArchived ? " · Archived" : ""}`}
          draft={draft}
          tabs={tabs}
          backLink={{ to: routes.accounts, label: "Back to accounts" }}
          actions={
            <>
              {account.isArchived ? (
                <ActionMenuItem
                  disabled={actions.restoreAccount.isPending}
                  onClick={() => actions.restoreAccount.mutate()}
                >
                  Restore
                </ActionMenuItem>
              ) : (
                <ActionMenuItem
                  disabled={actions.archiveAccount.isPending}
                  onClick={() => actions.archiveAccount.mutate()}
                >
                  Archive
                </ActionMenuItem>
              )}
              <ActionMenuItem
                variant="danger"
                disabled={actions.deleteAccount.isPending}
                onClick={confirmDelete}
              >
                Delete
              </ActionMenuItem>
            </>
          }
        >
        </FormView>
      </Card>
    </div>
  );
}
