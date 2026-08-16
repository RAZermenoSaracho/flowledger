import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { SearchBarQuery } from "../../components/SearchBar";
import { routes } from "../../constants/routes";
import { useAuth } from "../../hooks/useAuth";
import { listAccounts } from "../../services/accounts.client";
import { listCategories } from "../../services/categories.client";
import * as debtsClient from "../../services/debts.client";
import { listGroups } from "../../services/groups.client";
import { SharedExpensesPage } from "../SharedExpenses/SharedExpensesPage";
import { matchesWhere } from "../../utils/searchDomain";
import { BalancesTab } from "./components/BalancesTab";
import { PendingRequestsTab } from "./components/PendingRequestsTab";
import { SettledDebtsTab } from "./components/SettledDebtsTab";
import { useDebtSettlementWorkflow } from "./hooks/useDebtSettlementWorkflow";
import type { DebtsTab } from "./types/debts.types";
import { otherParty } from "./utils/debtDisplay";
import {
  toBalanceSearchRow,
  toSettledDebtSearchRow,
  toSettlementRequestSearchRow
} from "./utils/debtSearchFields";

const debtsTabs: { id: DebtsTab; label: string }[] = [
  { id: "balances", label: "Outstanding Balances" },
  { id: "pending", label: "Pending Settlement Requests" },
  { id: "settled", label: "Settled History" },
  { id: "sharedExpenses", label: "Shared Expenses" }
];

function isDebtsTab(value: string | null): value is DebtsTab {
  return (
    value === "balances" ||
    value === "pending" ||
    value === "settled" ||
    value === "sharedExpenses"
  );
}

/** Debts page: outstanding balances, pending settlement requests, and settled-history tabs. */
export function DebtsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const summaryCurrency = auth.user?.preferredCurrency || "USD";
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightedDebtId = searchParams.get("debtId");
  const highlightedSettlementId = searchParams.get("settlementId");
  const requestedTab = searchParams.get("tab");
  // The URL's `tab` param is the single source of truth for which tab is
  // active — both the desktop tab bar and the mobile drawer's subpage links
  // write to it (see `setActiveTab` below), so switching tabs from either
  // place is always reflected here reactively. "balances" is just the
  // natural fallback when the param is absent/invalid, not a special case.
  const activeTab: DebtsTab = isDebtsTab(requestedTab) ? requestedTab : "balances";

  function setActiveTab(tab: DebtsTab) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("tab", tab);
      return next;
    });
  }

  const [balanceQuery, setBalanceQuery] = useState<SearchBarQuery>({});
  const [pendingFromMeQuery, setPendingFromMeQuery] = useState<SearchBarQuery>(
    {}
  );
  const [pendingForMeQuery, setPendingForMeQuery] = useState<SearchBarQuery>(
    {}
  );
  const [settledQuery, setSettledQuery] = useState<SearchBarQuery>({});

  const debtsQuery = useQuery({
    queryKey: ["debts"],
    queryFn: async () => debtsClient.listDebts()
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

  const debts = debtsQuery.data;
  const privateExpenseCategories = useMemo(
    () =>
      (categoriesQuery.data ?? []).filter(
        (category) => category.type === "expense" && !category.groupId
      ),
    [categoriesQuery.data]
  );
  const privateIncomeCategories = useMemo(
    () =>
      (categoriesQuery.data ?? []).filter(
        (category) => category.type === "income" && !category.groupId
      ),
    [categoriesQuery.data]
  );
  const groupById = useMemo(
    () => new Map((groupsQuery.data ?? []).map((group) => [group.id, group])),
    [groupsQuery.data]
  );

  const workflow = useDebtSettlementWorkflow({
    groupById,
    privateExpenseCategories,
    privateIncomeCategories,
    accounts: accountsQuery.data ?? []
  });
  const { selectedApprovalIds, setSelectedApprovalIds } = workflow;

  const balances = debts?.balances ?? [];
  const visibleBalances = useMemo(
    () =>
      balances.filter((balance) =>
        matchesWhere(toBalanceSearchRow(balance), balanceQuery.where)
      ),
    [balanceQuery.where, balances]
  );
  const pendingForMe = useMemo(
    () =>
      (debts?.pendingSettlementRequests ?? []).filter(
        (request) => request.creditorUserId === auth.user?.id
      ),
    [auth.user?.id, debts?.pendingSettlementRequests]
  );
  const pendingFromMe = useMemo(
    () =>
      (debts?.pendingSettlementRequests ?? []).filter(
        (request) => request.debtorUserId === auth.user?.id
      ),
    [auth.user?.id, debts?.pendingSettlementRequests]
  );
  const visiblePendingForMe = useMemo(
    () =>
      pendingForMe.filter((request) =>
        matchesWhere(
          toSettlementRequestSearchRow(request),
          pendingForMeQuery.where
        )
      ),
    [pendingForMe, pendingForMeQuery.where]
  );
  const visiblePendingFromMe = useMemo(
    () =>
      pendingFromMe.filter((request) =>
        matchesWhere(
          toSettlementRequestSearchRow(request),
          pendingFromMeQuery.where
        )
      ),
    [pendingFromMe, pendingFromMeQuery.where]
  );
  const visibleSettledDebts = useMemo(
    () =>
      (debts?.settledDebts ?? []).filter((debt) =>
        matchesWhere(
          toSettledDebtSearchRow(debt, auth.user?.id),
          settledQuery.where
        )
      ),
    [auth.user?.id, debts?.settledDebts, settledQuery.where]
  );

  useEffect(() => {
    // An explicit, valid `tab` param always wins — this effect only
    // auto-resolves which tab to jump to when the URL doesn't already say.
    if (isDebtsTab(requestedTab)) return;

    if (highlightedSettlementId) {
      setActiveTab("pending");
      return;
    }
    if (!highlightedDebtId || !debts) return;

    const highlightedDebt = [...debts.iOwe, ...debts.owedToMe].find(
      (debt) => debt.id === highlightedDebtId
    );
    if (highlightedDebt) {
      const key = otherParty(highlightedDebt, auth.user?.id).key;
      navigate(
        `${routes.debts}/balances/${encodeURIComponent(key)}?debtId=${encodeURIComponent(highlightedDebtId)}`,
        { replace: true }
      );
    } else if (
      debts.settledDebts.some((debt) => debt.id === highlightedDebtId)
    ) {
      setActiveTab("settled");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user?.id, debts, highlightedDebtId, highlightedSettlementId, requestedTab]);

  useEffect(() => {
    const targetId = highlightedSettlementId
      ? `settlement-${highlightedSettlementId}`
      : highlightedDebtId
        ? `debt-${highlightedDebtId}`
        : null;
    if (!targetId || debtsQuery.isLoading) return;

    window.requestAnimationFrame(() => {
      document
        .getElementById(targetId)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [activeTab, debtsQuery.isLoading, highlightedDebtId, highlightedSettlementId]);

  return (
    <div className="grid gap-6">
      <div className="grid min-w-0 gap-4">
        <div
          className="hidden gap-2 lg:grid lg:grid-cols-2 xl:grid-cols-4"
          role="tablist"
          aria-label="Debt views"
        >
          {debtsTabs.map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`min-h-10 rounded-md px-3 py-2 text-sm font-semibold transition ${
                  isSelected
                    ? "bg-pine text-white dark:bg-emerald-700"
                    : "bg-white text-ink ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-800"
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" className="min-w-0">
          {activeTab === "balances" ? (
            <BalancesTab
              balances={balances}
              visibleBalances={visibleBalances}
              onBalanceQueryChange={setBalanceQuery}
              summaryCurrency={summaryCurrency}
            />
          ) : null}
          {activeTab === "pending" ? (
            <PendingRequestsTab
              pendingFromMe={pendingFromMe}
              pendingForMe={pendingForMe}
              visiblePendingFromMe={visiblePendingFromMe}
              visiblePendingForMe={visiblePendingForMe}
              onPendingFromMeQueryChange={setPendingFromMeQuery}
              onPendingForMeQueryChange={setPendingForMeQuery}
              highlightedSettlementId={highlightedSettlementId}
              selectedApprovalIds={selectedApprovalIds}
              onToggleApprovalSelection={workflow.toggleApprovalSelection}
              onSetApprovalSelection={workflow.setApprovalSelection}
              onClearApprovalSelection={() => setSelectedApprovalIds(new Set())}
              accounts={accountsQuery.data ?? []}
              isActing={workflow.isActing}
              approvalDraftFor={workflow.approvalDraftFor}
              onApprovalDraftChange={workflow.updateApprovalDraft}
              incomeCategoryOptionsFor={workflow.incomeCategoryOptionsFor}
              expenseOffsetCategoryOptionsFor={
                workflow.expenseOffsetCategoryOptionsFor
              }
              onApproveSettlement={(event, request) => {
                event.preventDefault();
                workflow.approveSettlement.mutate({
                  settlementId: request.id,
                  draft: workflow.approvalDraftFor(request)
                });
              }}
              onRejectSettlement={(settlementId) =>
                workflow.rejectSettlement.mutate(settlementId)
              }
              onSubmitBatchApproval={workflow.submitBatchApproval}
            />
          ) : null}
          {activeTab === "settled" ? (
            <SettledDebtsTab
              settledDebts={debts?.settledDebts ?? []}
              visibleSettledDebts={visibleSettledDebts}
              onSettledQueryChange={setSettledQuery}
              viewerUserId={auth.user?.id}
              highlightedDebtId={highlightedDebtId}
            />
          ) : null}
          {activeTab === "sharedExpenses" ? <SharedExpensesPage /> : null}
        </div>
      </div>

      {debtsQuery.isLoading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Loading debts...
        </p>
      ) : null}
      {debtsQuery.isError ? (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          Could not load debts.
        </p>
      ) : null}
    </div>
  );
}
