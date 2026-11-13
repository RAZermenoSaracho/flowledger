import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { SearchBarQuery } from "../../components/SearchBar";
import { Tabs } from "../../components/Tabs";
import { routes } from "../../constants/routes";
import { useAuth } from "../../hooks/useAuth";
import { useScrollToHighlight } from "../../hooks/useScrollToHighlight";
import { SharedExpensesPage } from "../SharedExpenses/SharedExpensesPage";
import { matchesWhere } from "../../utils/searchDomain";
import { AwaitingAcceptanceTab } from "./components/AwaitingAcceptanceTab";
import { BalancesTab } from "./components/BalancesTab";
import { PendingRequestsTab } from "./components/PendingRequestsTab";
import { SettledDebtsTab } from "./components/SettledDebtsTab";
import { useDebtsData } from "./hooks/useDebtsData";
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
  { id: "awaiting", label: "Awaiting Acceptance" },
  { id: "sharedExpenses", label: "Shared Expenses" }
];

const DEBTS_LOAD_ERROR = "Could not load debts.";

function isDebtsTab(value: string | null): value is DebtsTab {
  return debtsTabs.some((tab) => tab.id === value);
}

/** Debts page: outstanding balances, pending settlement requests, and settled-history tabs. */
export function DebtsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const summaryCurrency = auth.user?.preferredCurrency || "USD";
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightedDebtId = searchParams.get("debtId");
  const highlightedSettlementId = searchParams.get("settlementId");
  const highlightedSharedExpenseId = searchParams.get("sharedExpenseId");
  const requestedTab = searchParams.get("tab");
  // The URL's `tab` param is the single source of truth for which tab is
  // active — both the desktop tab bar and the mobile drawer's subpage links
  // write to it (see `setActiveTab` below), so switching tabs from either
  // place is always reflected here reactively. "balances" is just the
  // natural fallback when the param is absent/invalid, not a special case.
  const activeTab: DebtsTab = isDebtsTab(requestedTab)
    ? requestedTab
    : "balances";

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

  const { debtsQuery, accounts, workflow } = useDebtsData();

  const debts = debtsQuery.data;
  const listState = {
    isLoading: debtsQuery.isLoading,
    error: debtsQuery.isError ? DEBTS_LOAD_ERROR : null
  };

  const balances = useMemo(() => debts?.balances ?? [], [debts?.balances]);
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
  }, [
    auth.user?.id,
    debts,
    highlightedDebtId,
    highlightedSettlementId,
    requestedTab
  ]);

  useScrollToHighlight(
    highlightedSettlementId
      ? `settlement-${highlightedSettlementId}`
      : highlightedDebtId
        ? `debt-${highlightedDebtId}`
        : null,
    debtsQuery.isLoading,
    activeTab
  );

  const tabContent: Record<DebtsTab, ReactNode> = {
    balances: (
      <BalancesTab
        balances={balances}
        visibleBalances={visibleBalances}
        onBalanceQueryChange={setBalanceQuery}
        summaryCurrency={summaryCurrency}
        {...listState}
      />
    ),
    pending: (
      <PendingRequestsTab
        pendingFromMe={pendingFromMe}
        pendingForMe={pendingForMe}
        visiblePendingFromMe={visiblePendingFromMe}
        visiblePendingForMe={visiblePendingForMe}
        onPendingFromMeQueryChange={setPendingFromMeQuery}
        onPendingForMeQueryChange={setPendingForMeQuery}
        highlightedSettlementId={highlightedSettlementId}
        approvalSelection={workflow.approvalSelection}
        accounts={accounts}
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
        {...listState}
      />
    ),
    settled: (
      <SettledDebtsTab
        settledDebts={debts?.settledDebts ?? []}
        visibleSettledDebts={visibleSettledDebts}
        onSettledQueryChange={setSettledQuery}
        viewerUserId={auth.user?.id}
        highlightedDebtId={highlightedDebtId}
        {...listState}
      />
    ),
    awaiting: (
      <AwaitingAcceptanceTab
        awaiting={debts?.awaitingAcceptance ?? []}
        rejected={debts?.rejectedShares ?? []}
        viewerUserId={auth.user?.id}
        highlightedSharedExpenseId={highlightedSharedExpenseId}
        {...listState}
      />
    ),
    sharedExpenses: <SharedExpensesPage />
  };

  return (
    <div className="grid gap-6">
      <Tabs
        label="Debt views"
        variant="buttons"
        desktopOnly
        idPrefix="debts-"
        activeId={activeTab}
        onSelect={(id) => setActiveTab(id as DebtsTab)}
        tabs={debtsTabs.map((tab) => ({ ...tab, content: tabContent[tab.id] }))}
      />
    </div>
  );
}
