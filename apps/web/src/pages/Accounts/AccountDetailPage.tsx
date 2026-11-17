import { ACCOUNT_TYPES, HOLDING_ACCOUNT_TYPES } from "@flowledger/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams
} from "react-router-dom";
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
import type { SearchBarQuery } from "../../components/SearchBar";
import { createEmptyGroup, hasConditionOn } from "../../utils/searchDomain";
import { useAuth } from "../../hooks/useAuth";
import * as accountsClient from "../../services/accounts.client";
import { AccountSyncPanel } from "./components/AccountSyncPanel";
import { AddAccountCard } from "./components/AddAccountCard";
import { CreditCardTab } from "./components/CreditCardTab";
import { NetContributions } from "./components/NetContributions";
import { HoldingsTab } from "./components/HoldingsTab";
import { HoldingsValueSummary } from "./components/HoldingsValueSummary";
import { AccountTypeSections } from "./components/AccountTypeSections";
import { useAccountActions } from "./hooks/useAccountActions";
import { useAccountForm } from "./hooks/useAccountForm";
import { useAccountHoldings } from "./hooks/useAccountHoldings";
import { useAccountProviderSync } from "./hooks/useAccountProviderSync";
import type { AccountDraft } from "./types/accounts.types";
import { getAccountTypeLabel } from "./utils/accountDisplay";
import { isHoldingType } from "./utils/holdingsDraft";
import {
  BILLING_PERIOD_FIELD,
  billingPeriodCondition,
  billingPeriodField
} from "./utils/billingPeriodFilter";
import "@syncfy/authentication-widget/dist/syncfy-authentication-widget.css";

/**
 * Account Form View. At `/accounts/:id`: tabs General (editable fields, type sections, sync panel), Transactions
 * (the standard transaction SearchBar; a `periodStartAt`/`periodEndAt` URL pair opens it with a removable Billing period
 * condition, kept in sync with the URL) and, for credit cards, Credit
 * card, and for investment and crypto accounts, Holdings (rows edited inside the same draft; Save sends the account `PUT`, then one holdings `PATCH`); archive/restore/delete in the actions menu. Unknown or foreign ids show the same not-found state.
 * At `/accounts/new`: an unsaved manual-account draft (General fields and type sections only) that creates nothing
 * until Save, then opens the new account.
 */
export function AccountDetailPage() {
  const { id = "" } = useParams();
  const isNew = !id;
  const auth = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const accountsQuery = useQuery({
    queryKey: ["accounts", "all"],
    enabled: !isNew,
    queryFn: async () => (await accountsClient.listAccounts()).accounts
  });
  const account = accountsQuery.data?.find((item) => item.id === id) ?? null;

  const hasHoldingsTab = Boolean(
    account &&
    (HOLDING_ACCOUNT_TYPES as readonly string[]).includes(account.type)
  );
  const holdings = useAccountHoldings(id, hasHoldingsTab);
  const savedHoldings = holdings.query.data?.holdings;
  const holdingsBinding = useMemo(
    () =>
      savedHoldings ? { saved: savedHoldings, save: holdings.save } : undefined,
    [savedHoldings, holdings.save]
  );

  const draft = useAccountForm(
    account,
    isNew && !auth.isInitializing
      ? {
          currency: auth.user?.preferredCurrency || "USD",
          onCreated: (created) =>
            navigate(routes.account(created.id), { replace: true })
        }
      : undefined,
    holdingsBinding
  );
  const actions = useAccountActions(id);
  const sync = useAccountProviderSync();

  const periodStartAt = searchParams.get("periodStartAt");
  const periodEndAt = searchParams.get("periodEndAt");
  const periodKey =
    periodStartAt && periodEndAt ? `${periodStartAt}|${periodEndAt}` : "";
  // The Transactions tab's SearchBar reads its domain once on mount: an external URL change (period link,
  // back/forward) remounts it, while removing the period chip only clears the URL and keeps the other filters.
  const [periodListKey, setPeriodListKey] = useState(0);
  const periodClearedBySearch = useRef(false);
  const lastPeriodKey = useRef(periodKey);
  useEffect(() => {
    if (periodKey === lastPeriodKey.current) return;
    lastPeriodKey.current = periodKey;
    if (periodClearedBySearch.current) periodClearedBySearch.current = false;
    else setPeriodListKey((key) => key + 1);
  }, [periodKey]);
  const billingTimeZone =
    account?.type === "credit_card" ? account.billingTimeZone : null;
  const periodFields = useMemo(
    () => (billingTimeZone ? [billingPeriodField(billingTimeZone)] : undefined),
    [billingTimeZone]
  );
  const periodDomain = useMemo(
    () =>
      periodFields && periodStartAt && periodEndAt
        ? {
            ...createEmptyGroup("and"),
            children: [billingPeriodCondition(periodStartAt, periodEndAt)]
          }
        : undefined,
    [periodFields, periodStartAt, periodEndAt]
  );

  function syncPeriodToUrl(query: SearchBarQuery) {
    if (
      !periodKey ||
      !query.domain ||
      hasConditionOn(query.domain, BILLING_PERIOD_FIELD)
    )
      return;
    periodClearedBySearch.current = true;
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const key of [
          "periodFrom",
          "periodTo",
          "periodStartAt",
          "periodEndAt"
        ])
          next.delete(key);
        return next;
      },
      { replace: true }
    );
  }

  if (accountsQuery.isLoading || (isNew && auth.isInitializing)) {
    return <Card>Loading...</Card>;
  }
  if (!account && !isNew) {
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
            {isHoldingType(values.type) ? null : (
              <EditableField
                label="Initial balance"
                {...field("initialBalance")}
              >
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
            )}
          </div>

          <AccountTypeSections type={values.type} draft={draft} />

          {account ? (
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
                hasCredentialFlowError={
                  sync.startProviderCredentialFlow.isError
                }
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
          ) : null}
        </>
      )
    },
    ...(account
      ? [
          {
            id: "transactions",
            label: "Transactions",
            content: (
              <>
                {account.contributions ? (
                  <NetContributions contributions={account.contributions} />
                ) : null}
                <RelatedTransactionsList
                  key={`${account.id}:${periodListKey}`}
                  scope={{
                    field: "accountId",
                    value: account.id,
                    transfersInWith: BILLING_PERIOD_FIELD,
                    includeTransfersIn: isHoldingType(account.type)
                  }}
                  extraFields={periodFields}
                  initialDomain={periodDomain}
                  onQueryChange={syncPeriodToUrl}
                  emptyText="No transactions for this account yet."
                />
              </>
            )
          },
          ...(account.type === "credit_card"
            ? [
                {
                  id: "credit-card",
                  label: "Credit card",
                  content: <CreditCardTab account={account} />
                }
              ]
            : []),
          ...(hasHoldingsTab
            ? [
                {
                  id: "holdings",
                  label: "Holdings",
                  content: (
                    <HoldingsTab
                      draft={draft}
                      accountType={account.type}
                      accountCurrency={account.currency}
                      saved={savedHoldings ?? []}
                      isLoading={holdings.query.isLoading}
                      error={
                        holdings.query.isError
                          ? "Holdings could not be loaded."
                          : null
                      }
                    />
                  )
                }
              ]
            : [])
        ]
      : [])
  ];

  return (
    <div className="grid gap-6">
      <AddAccountCard sync={sync} />
      <Card>
        <FormView
          title={account ? account.name : "New account"}
          subtitle={
            account
              ? `${getAccountTypeLabel(account.type)}${account.isArchived ? " · Archived" : ""}`
              : undefined
          }
          headerExtra={
            account?.holdingsValuation ? (
              <HoldingsValueSummary valuation={account.holdingsValuation} />
            ) : undefined
          }
          draft={draft}
          tabs={tabs}
          backLink={{ to: routes.accounts, label: "Back to accounts" }}
          isNew={isNew}
          actions={
            account ? (
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
            ) : undefined
          }
        />
      </Card>
    </div>
  );
}
