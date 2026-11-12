import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ActionMenuItem } from "../../components/ActionMenu";
import { Card } from "../../components/Card";
import { FormView } from "../../components/FormView";
import { routes } from "../../constants/routes";
import { useAuth } from "../../hooks/useAuth";
import { listAccounts } from "../../services/accounts.client";
import { listCategories } from "../../services/categories.client";
import { listGroups } from "../../services/groups.client";
import {
  deleteTransaction as deleteTransactionRequest,
  getTransaction
} from "../../services/transactions.client";
import type { Transaction } from "../../types/transactions.types";
import { formatMoney } from "../../utils/currency";
import { formatTransactionDate, transactionDateNowInputValue } from "../../utils/dateTime";
import { TransactionDetailsFields } from "./components/TransactionDetailsFields";
import { hasRelatedRecords, TransactionRelatedTab } from "./components/TransactionRelatedTab";
import { hasRelatedSettlements, TransactionSettlementsTab } from "./components/TransactionSettlementsTab";
import { TransactionSharingTab } from "./components/TransactionSharingTab";
import { useTransactionForm } from "./hooks/useTransactionForm";
import { draftFromTransaction, newTransactionDraft } from "./utils/transactionDraft";
import { parseTransactionPrefill } from "./utils/transactionPrefill";
import { selectAccount } from "./utils/transactionDraftReducers";

function needsClassification(transaction: Transaction) {
  if (transaction.type === "transfer") {
    return !transaction.accountId || !transaction.transferToAccountId;
  }

  return !transaction.accountId || !transaction.categoryId;
}

/**
 * Transaction Form View. At `/transactions/:id` it edits a stored transaction in place; at
 * `/transactions/new` it edits an unsaved draft (optionally prefilled from query params) that
 * creates nothing until Save. A missing or foreign id shows the not-found state.
 */
export function TransactionDetailPage() {
  const { id } = useParams();
  const isNew = !id;
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [openedAt] = useState(transactionDateNowInputValue);

  const transactionQuery = useQuery({
    queryKey: ["transaction", id],
    enabled: !isNew,
    queryFn: async () => (await getTransaction(id!)).transaction
  });
  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => (await listAccounts()).accounts
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await listCategories()).categories
  });
  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: async () => (await listGroups()).groups
  });
  const deleteTransaction = useMutation({
    mutationFn: (transactionId: string) => deleteTransactionRequest(transactionId),
    onSuccess: async () => {
      for (const key of [
        "transactions",
        "accounts",
        "groups",
        "summary",
        "cashflow",
        "shared-expenses",
        "debts",
        "notifications"
      ]) {
        await queryClient.invalidateQueries({ queryKey: [key] });
      }
      navigate(routes.transactions);
    }
  });

  const transaction = transactionQuery.data ?? null;
  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const accountsReady = !accountsQuery.isLoading;
  const defaultCurrency = auth.user?.preferredCurrency || "USD";
  const prefillKey = useMemo(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("tab");
    return params.toString();
  }, [searchParams]);

  const initial = useMemo(() => {
    if (transaction) return draftFromTransaction(transaction);
    if (!isNew || !accountsReady || auth.isInitializing) return null;
    return newTransactionDraft(defaultCurrency, openedAt);
  }, [transaction, isNew, accountsReady, auth.isInitializing, defaultCurrency, openedAt]);

  const prefilled = useMemo(() => {
    if (!initial || transaction) return null;
    const prefill = parseTransactionPrefill(new URLSearchParams(prefillKey));
    const draft = { ...initial, ...prefill };
    return prefill.accountId && !prefill.executionCurrency
      ? selectAccount(draft, prefill.accountId, accounts)
      : draft;
  }, [initial, transaction, prefillKey, accounts]);

  const draft = useTransactionForm({ initial, original: transaction });

  const appliedPrefillKey = useRef<string | null>(null);
  const applyPrefill = draft.update;
  useEffect(() => {
    if (!prefilled || appliedPrefillKey.current === prefillKey) return;
    appliedPrefillKey.current = prefillKey;
    applyPrefill(() => prefilled);
  }, [prefilled, prefillKey, applyPrefill]);
  if (!isNew && transactionQuery.isError) {
    return (
      <Card>
        <h1 className="text-xl font-semibold">Transaction not found</h1>
        <Link to={routes.transactions} className="text-pine underline">
          Back to transactions
        </Link>
      </Card>
    );
  }
  if (!initial) {
    return <Card>Loading transaction...</Card>;
  }

  const selectedGroup = (groupsQuery.data ?? []).find((group) => group.id === draft.values.groupId);
  const tabs = [
    {
      id: "details",
      label: "Details",
      content: (
        <TransactionDetailsFields
          draft={draft}
          isNew={isNew}
          transaction={transaction}
          accounts={accounts}
          categories={categoriesQuery.data ?? []}
          groups={groupsQuery.data ?? []}
          currentUserId={auth.user?.id}
          preferredCurrency={auth.user?.preferredCurrency}
        />
      )
    },
    {
      id: "sharing",
      label: "Sharing",
      content: (
        <TransactionSharingTab
          draft={draft}
          transaction={transaction}
          group={selectedGroup}
          currentUserId={auth.user?.id}
        />
      )
    },
    ...(transaction && hasRelatedRecords(transaction)
      ? [{ id: "related", label: "Related transactions", content: <TransactionRelatedTab transaction={transaction} /> }]
      : []),
    ...(transaction && hasRelatedSettlements(transaction)
      ? [{ id: "settlements", label: "Related settlements", content: <TransactionSettlementsTab transaction={transaction} /> }]
      : [])
  ];

  return (
    <Card>
      <FormView
        title={transaction ? transaction.name : "New transaction"}
        subtitle={
          transaction
            ? `${formatMoney(transaction.amount, transaction.executionCurrency)} · ${formatTransactionDate(transaction)}`
            : undefined
        }
        draft={draft}
        tabs={tabs}
        backLink={{ to: routes.transactions, label: "Back to transactions" }}
        isNew={isNew}
        actions={
          transaction ? (
            <ActionMenuItem
              variant="danger"
              disabled={deleteTransaction.isPending}
              onClick={() => {
                const sharedCleanup = transaction.sharedExpense
                  ? " This transaction has a shared expense, so participants, debts, settlements, and related notifications will also be removed."
                  : "";
                if (window.confirm(`Delete "${transaction.name}" permanently?${sharedCleanup}`)) {
                  void deleteTransaction.mutateAsync(transaction.id);
                }
              }}
            >
              Delete
            </ActionMenuItem>
          ) : undefined
        }
        headerExtra={
          transaction ? (
            <>
              {needsClassification(transaction) ? (
                <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                  {transaction.type === "transfer"
                    ? "Pending classification: add from and to accounts."
                    : "Pending classification: add a category and account."}
                </p>
              ) : null}
            </>
          ) : null
        }
      />
    </Card>
  );
}
