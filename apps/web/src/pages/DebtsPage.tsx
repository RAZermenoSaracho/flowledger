import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { SelectField, TextInput } from "../components/FormField";
import { SearchComponent } from "../components/SearchComponent";
import { useAuth } from "../hooks/useAuth";
import { apiRequest } from "../services/api";
import { SharedExpensesPage } from "./SharedExpensesPage";
import type {
  Account,
  Category,
  Debt,
  Group,
  PublicUser,
  SettlementRequest
} from "../types/api";
import { matchesSearch } from "../utils/search";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

type DebtsResponse = {
  iOwe: Debt[];
  owedToMe: Debt[];
  pendingSettlementRequests: SettlementRequest[];
  approvedSettlementRequests: SettlementRequest[];
  settledDebts: Debt[];
};

type SettlementDraft = {
  amount: string;
  accountId: string;
  categoryId: string;
  note: string;
  paymentInfo: string;
};

type SettlementApprovalDraft = {
  accountId: string;
  categoryId: string;
  expenseOffsetCategoryId: string;
};

type DebtsTab = "balances" | "pending" | "settled" | "sharedExpenses";

type PersonBalance = {
  key: string;
  person?: PublicUser | null;
  fallbackName: string;
  theyOweMe: Debt[];
  iOweThem: Debt[];
  theyOweMeTotal: number;
  iOweThemTotal: number;
  netBalance: number;
};

const debtsTabs: { id: DebtsTab; label: string }[] = [
  { id: "balances", label: "Outstanding Balances" },
  { id: "pending", label: "Pending Settlement Requests" },
  { id: "settled", label: "Settled History" },
  { id: "sharedExpenses", label: "Shared Expenses" }
];

function debtTitle(debt: Debt) {
  return debt.sharedExpense.title;
}

function participantName(debt: Debt) {
  return debt.user?.name ?? debt.participantName;
}

function partyName(debt: Debt, userId?: string | null) {
  if (!userId) return undefined;
  if (userId === debt.sharedExpense.ownerUserId)
    return debt.sharedExpense.owner?.name;
  if (userId === debt.userId) return participantName(debt);
  if (
    !debt.userId &&
    (userId === debt.debtorUserId || userId === debt.creditorUserId)
  ) {
    return participantName(debt);
  }
  return undefined;
}

function otherParty(debt: Debt, viewerUserId?: string | null) {
  const otherUserId =
    debt.debtorUserId === viewerUserId
      ? debt.creditorUserId
      : debt.debtorUserId;
  const person =
    otherUserId === debt.sharedExpense.ownerUserId
      ? debt.sharedExpense.owner
      : otherUserId === debt.userId
        ? debt.user
        : undefined;

  return {
    key: otherUserId ?? `participant:${debt.id}`,
    person,
    fallbackName:
      partyName(debt, otherUserId) ?? participantName(debt) ?? "Unknown user"
  };
}

function displayPerson(balance: PersonBalance) {
  return balance.person?.name ?? balance.fallbackName;
}

function transactionTypeLabel(debt: Debt) {
  return debt.sharedExpense.transaction?.type === "income"
    ? "income split"
    : "expense split";
}

function debtDescription(debt: Debt, viewerUserId?: string) {
  const otherPartyName =
    debt.debtorUserId === viewerUserId
      ? partyName(debt, debt.creditorUserId)
      : partyName(debt, debt.debtorUserId);

  return `${otherPartyName ?? "Unknown user"} · ${transactionTypeLabel(debt)} · ${money.format(
    debt.paidAmount
  )} settled of ${money.format(debt.shareAmount)}`;
}

function statusLabel(debt: Debt) {
  if (debt.outstandingAmount <= 0) return "settled";
  if (debt.pendingSettlementAmount > 0) return "settlement pending";
  return debt.status;
}

function availableSettlementAmount(debt: Debt) {
  return Math.max(0, debt.outstandingAmount - debt.pendingSettlementAmount);
}

function debtMatchesSearch(debt: Debt, search: string, viewerUserId?: string) {
  return matchesSearch(
    [
      debtTitle(debt),
      debtDescription(debt, viewerUserId),
      statusLabel(debt),
      debt.participantName,
      debt.user?.name,
      debt.user?.email,
      debt.sharedExpense.owner?.name,
      debt.sharedExpense.owner?.email,
      debt.sharedExpense.transaction?.name,
      debt.shareAmount,
      debt.paidAmount,
      debt.outstandingAmount
    ],
    search
  );
}

function settlementRequestMatchesSearch(
  request: SettlementRequest,
  search: string
) {
  const debt = request.sharedExpenseParticipant;
  return matchesSearch(
    [
      debt?.sharedExpense.title,
      debt?.sharedExpense.transaction?.name,
      request.debtor?.name,
      request.debtor?.email,
      request.creditor?.name,
      request.creditor?.email,
      request.amount,
      request.status,
      request.note
    ],
    search
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-slate-500 dark:text-slate-400">{children}</p>
  );
}

export function DebtsPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const highlightedDebtId = searchParams.get("debtId");
  const highlightedSettlementId = searchParams.get("settlementId");
  const [drafts, setDrafts] = useState<Record<string, SettlementDraft>>({});
  const [approvalDrafts, setApprovalDrafts] = useState<
    Record<string, SettlementApprovalDraft>
  >({});
  const [activeTab, setActiveTab] = useState<DebtsTab>("balances");
  const [balanceSearch, setBalanceSearch] = useState("");
  const [pendingFromMeSearch, setPendingFromMeSearch] = useState("");
  const [pendingForMeSearch, setPendingForMeSearch] = useState("");
  const [settledSearch, setSettledSearch] = useState("");
  const [selectedPersonKey, setSelectedPersonKey] = useState<string | null>(
    null
  );
  const [selectedDebtIds, setSelectedDebtIds] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedApprovalIds, setSelectedApprovalIds] = useState<Set<string>>(
    () => new Set()
  );

  const debtsQuery = useQuery({
    queryKey: ["debts"],
    queryFn: async () => apiRequest<DebtsResponse>("/debts")
  });
  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: async () =>
      (await apiRequest<{ accounts: Account[] }>("/accounts")).accounts
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: async () =>
      (await apiRequest<{ categories: Category[] }>("/categories")).categories
  });
  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: async () =>
      (await apiRequest<{ groups: Group[] }>("/groups")).groups
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
  const balances = useMemo(() => {
    const byPerson = new Map<string, PersonBalance>();

    function ensureBalance(debt: Debt) {
      const party = otherParty(debt, auth.user?.id);
      const existing = byPerson.get(party.key);
      if (existing) return existing;

      const next: PersonBalance = {
        key: party.key,
        person: party.person,
        fallbackName: party.fallbackName,
        theyOweMe: [],
        iOweThem: [],
        theyOweMeTotal: 0,
        iOweThemTotal: 0,
        netBalance: 0
      };
      byPerson.set(party.key, next);
      return next;
    }

    (debts?.owedToMe ?? []).forEach((debt) => {
      const balance = ensureBalance(debt);
      balance.theyOweMe.push(debt);
      balance.theyOweMeTotal += debt.outstandingAmount;
    });
    (debts?.iOwe ?? []).forEach((debt) => {
      const balance = ensureBalance(debt);
      balance.iOweThem.push(debt);
      balance.iOweThemTotal += debt.outstandingAmount;
    });

    return Array.from(byPerson.values())
      .map((balance) => ({
        ...balance,
        netBalance: balance.theyOweMeTotal - balance.iOweThemTotal
      }))
      .sort((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance));
  }, [auth.user?.id, debts?.iOwe, debts?.owedToMe]);
  const balanceByKey = useMemo(
    () => new Map(balances.map((balance) => [balance.key, balance])),
    [balances]
  );
  const selectedBalance = selectedPersonKey
    ? balanceByKey.get(selectedPersonKey)
    : null;
  const visibleBalances = useMemo(
    () =>
      balances.filter((balance) =>
        matchesSearch(
          [
            displayPerson(balance),
            balance.person?.email,
            balance.netBalance,
            balance.theyOweMeTotal,
            balance.iOweThemTotal,
            balance.theyOweMe.map(debtTitle).join(" "),
            balance.iOweThem.map(debtTitle).join(" ")
          ],
          balanceSearch
        )
      ),
    [balanceSearch, balances]
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
        settlementRequestMatchesSearch(request, pendingForMeSearch)
      ),
    [pendingForMe, pendingForMeSearch]
  );
  const visiblePendingFromMe = useMemo(
    () =>
      pendingFromMe.filter((request) =>
        settlementRequestMatchesSearch(request, pendingFromMeSearch)
      ),
    [pendingFromMe, pendingFromMeSearch]
  );
  const visibleSettledDebts = useMemo(
    () =>
      (debts?.settledDebts ?? []).filter((debt) =>
        debtMatchesSearch(debt, settledSearch, auth.user?.id)
      ),
    [auth.user?.id, debts?.settledDebts, settledSearch]
  );
  const selectedIOweThem = useMemo(
    () =>
      (selectedBalance?.iOweThem ?? []).filter(
        (debt) =>
          selectedDebtIds.has(debt.id) && availableSettlementAmount(debt) > 0
      ),
    [selectedBalance?.iOweThem, selectedDebtIds]
  );

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (
      requestedTab === "pending" ||
      requestedTab === "settled" ||
      requestedTab === "sharedExpenses"
    ) {
      setActiveTab(requestedTab);
      return;
    }
    if (highlightedSettlementId) {
      setActiveTab("pending");
      return;
    }
    if (!highlightedDebtId || !debts) return;

    const highlightedDebt = [...debts.iOwe, ...debts.owedToMe].find(
      (debt) => debt.id === highlightedDebtId
    );
    if (highlightedDebt) {
      setActiveTab("balances");
      setSelectedPersonKey(otherParty(highlightedDebt, auth.user?.id).key);
      setSelectedDebtIds(new Set([highlightedDebt.id]));
    } else if (
      debts.settledDebts.some((debt) => debt.id === highlightedDebtId)
    ) {
      setActiveTab("settled");
    }
  }, [
    auth.user?.id,
    debts,
    highlightedDebtId,
    highlightedSettlementId,
    searchParams
  ]);

  useEffect(() => {
    if (selectedPersonKey && !balanceByKey.has(selectedPersonKey)) {
      setSelectedPersonKey(null);
      setSelectedDebtIds(new Set());
    }
  }, [balanceByKey, selectedPersonKey]);

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
  }, [
    activeTab,
    debtsQuery.isLoading,
    highlightedDebtId,
    highlightedSettlementId,
    selectedPersonKey
  ]);

  const requestSettlement = useMutation({
    mutationFn: ({
      debtId,
      draft
    }: {
      debtId: string;
      draft: SettlementDraft;
    }) => createSettlementRequest(debtId, draft),
    onSuccess: async (_data, variables) => {
      setDrafts((current) => {
        const next = { ...current };
        delete next[variables.debtId];
        return next;
      });
      setSelectedDebtIds((current) => {
        const next = new Set(current);
        next.delete(variables.debtId);
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
    }
  });
  const requestBatchSettlement = useMutation({
    mutationFn: async ({ selectedDebts }: { selectedDebts: Debt[] }) => {
      await Promise.all(
        selectedDebts.map((debt) =>
          createSettlementRequest(debt.id, draftFor(debt))
        )
      );
    },
    onSuccess: async (_data, variables) => {
      const settledIds = new Set(
        variables.selectedDebts.map((debt) => debt.id)
      );
      setSelectedDebtIds((current) => {
        const next = new Set(current);
        settledIds.forEach((id) => next.delete(id));
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
    }
  });
  const approveSettlement = useMutation({
    mutationFn: ({
      settlementId,
      draft
    }: {
      settlementId: string;
      draft: SettlementApprovalDraft;
    }) =>
      apiRequest(`/settlements/${settlementId}/approve`, {
        method: "POST",
        body: {
          accountId: draft.accountId,
          categoryId: draft.categoryId,
          expenseOffsetCategoryId: draft.expenseOffsetCategoryId || null
        }
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });
  const approveBatchSettlements = useMutation({
    mutationFn: async (
      approvals: { settlementId: string; draft: SettlementApprovalDraft }[]
    ) => {
      await Promise.all(
        approvals.map(({ settlementId, draft }) =>
          apiRequest(`/settlements/${settlementId}/approve`, {
            method: "POST",
            body: {
              accountId: draft.accountId,
              categoryId: draft.categoryId,
              expenseOffsetCategoryId: draft.expenseOffsetCategoryId || null
            }
          })
        )
      );
    },
    onSuccess: async (_data, variables) => {
      const approvedIds = new Set(
        variables.map((approval) => approval.settlementId)
      );
      setSelectedApprovalIds((current) => {
        const next = new Set(current);
        approvedIds.forEach((id) => next.delete(id));
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });
  const rejectSettlement = useMutation({
    mutationFn: (settlementId: string) =>
      apiRequest(`/settlements/${settlementId}/reject`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
    }
  });

  function createSettlementRequest(debtId: string, draft: SettlementDraft) {
    return apiRequest(`/debts/${debtId}/settlement-request`, {
      method: "POST",
      body: {
        amount: Number(draft.amount),
        accountId: draft.accountId,
        categoryId: draft.categoryId || null,
        note: draft.note.trim() || null,
        paymentInfo: draft.paymentInfo.trim() || null
      }
    });
  }

  function categoryOptionsFor(debt: Debt) {
    const originalGroupId = debt.sharedExpense.transaction?.groupId ?? "";
    const originalGroup = originalGroupId
      ? groupById.get(originalGroupId)
      : undefined;
    return originalGroup
      ? originalGroup.categories.filter(
          (category) => category.type === "expense"
        )
      : privateExpenseCategories;
  }

  function incomeCategoryOptionsFor(request: SettlementRequest) {
    const originalGroupId =
      request.sharedExpenseParticipant?.sharedExpense.transaction?.groupId ??
      "";
    const originalGroup = originalGroupId
      ? groupById.get(originalGroupId)
      : undefined;
    return originalGroup
      ? originalGroup.categories.filter(
          (category) => category.type === "income"
        )
      : privateIncomeCategories;
  }

  function expenseOffsetCategoryOptionsFor(request: SettlementRequest) {
    const originalGroupId =
      request.sharedExpenseParticipant?.sharedExpense.transaction?.groupId ??
      "";
    const originalGroup = originalGroupId
      ? groupById.get(originalGroupId)
      : undefined;
    return originalGroup
      ? originalGroup.categories.filter(
          (category) => category.type === "expense"
        )
      : privateExpenseCategories;
  }

  function defaultApprovalDraftFor(
    request?: SettlementRequest
  ): SettlementApprovalDraft {
    const incomeCategories = request
      ? incomeCategoryOptionsFor(request)
      : privateIncomeCategories;
    const expenseOffsetCategories = request
      ? expenseOffsetCategoryOptionsFor(request)
      : privateExpenseCategories;
    const originalCategoryId =
      request?.sharedExpenseParticipant?.sharedExpense.transaction
        ?.categoryId ?? "";

    return {
      accountId: accountsQuery.data?.[0]?.id ?? "",
      categoryId: incomeCategories[0]?.id ?? "",
      expenseOffsetCategoryId: expenseOffsetCategories.some(
        (category) => category.id === originalCategoryId
      )
        ? originalCategoryId
        : ""
    };
  }

  function approvalDraftFor(request: SettlementRequest) {
    return approvalDrafts[request.id] ?? defaultApprovalDraftFor(request);
  }

  function updateApprovalDraft(
    request: SettlementRequest,
    field: keyof SettlementApprovalDraft,
    value: string
  ) {
    setApprovalDrafts((current) => ({
      ...current,
      [request.id]: {
        ...(current[request.id] ?? defaultApprovalDraftFor(request)),
        [field]: value
      }
    }));
  }

  function defaultDraftFor(debt: Debt): SettlementDraft {
    const originalGroupId = debt.sharedExpense.transaction?.groupId ?? "";
    const originalCategoryId =
      originalGroupId && debt.sharedExpense.transaction?.categoryId
        ? debt.sharedExpense.transaction.categoryId
        : "";
    return {
      amount: String(availableSettlementAmount(debt)),
      accountId: accountsQuery.data?.[0]?.id ?? "",
      categoryId: originalCategoryId || (privateExpenseCategories[0]?.id ?? ""),
      note: "",
      paymentInfo: ""
    };
  }

  function draftFor(debt: Debt) {
    return drafts[debt.id] ?? defaultDraftFor(debt);
  }

  function isSettlementDraftComplete(debt: Debt) {
    const draft = draftFor(debt);
    const amount = Number(draft.amount);
    return (
      Number.isFinite(amount) &&
      amount > 0 &&
      amount <= availableSettlementAmount(debt) &&
      Boolean(draft.accountId) &&
      Boolean(draft.categoryId)
    );
  }

  function updateDraft(
    debt: Debt,
    field: keyof SettlementDraft,
    value: string
  ) {
    setDrafts((current) => ({
      ...current,
      [debt.id]: {
        ...(current[debt.id] ?? defaultDraftFor(debt)),
        [field]: value
      }
    }));
  }

  function toggleDebtSelection(debtId: string) {
    setSelectedDebtIds((current) => {
      const next = new Set(current);
      if (next.has(debtId)) next.delete(debtId);
      else next.add(debtId);
      return next;
    });
  }

  function setDetailSelection(debtsToSelect: Debt[], selected: boolean) {
    setSelectedDebtIds((current) => {
      const next = new Set(current);
      debtsToSelect.forEach((debt) => {
        if (selected) next.add(debt.id);
        else next.delete(debt.id);
      });
      return next;
    });
  }

  async function submitSettlement(event: FormEvent, debt: Debt) {
    event.preventDefault();
    await requestSettlement.mutateAsync({
      debtId: debt.id,
      draft: draftFor(debt)
    });
  }

  async function submitBatchSettlement(event: FormEvent) {
    event.preventDefault();
    if (
      selectedIOweThem.length === 0 ||
      !selectedIOweThem.every(isSettlementDraftComplete)
    ) {
      return;
    }
    await requestBatchSettlement.mutateAsync({
      selectedDebts: selectedIOweThem
    });
  }

  function toggleApprovalSelection(settlementId: string) {
    setSelectedApprovalIds((current) => {
      const next = new Set(current);
      if (next.has(settlementId)) next.delete(settlementId);
      else next.add(settlementId);
      return next;
    });
  }

  function setApprovalSelection(
    requests: SettlementRequest[],
    selected: boolean
  ) {
    setSelectedApprovalIds((current) => {
      const next = new Set(current);
      requests.forEach((request) => {
        if (selected) next.add(request.id);
        else next.delete(request.id);
      });
      return next;
    });
  }

  async function submitBatchApproval(requests: SettlementRequest[]) {
    await approveBatchSettlements.mutateAsync(
      requests.map((request) => ({
        settlementId: request.id,
        draft: approvalDraftFor(request)
      }))
    );
  }

  const isActing =
    requestSettlement.isPending ||
    requestBatchSettlement.isPending ||
    approveSettlement.isPending ||
    approveBatchSettlements.isPending ||
    rejectSettlement.isPending;

  function renderBalances() {
    return (
      <div className="grid gap-4">
        <Card>
          <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold">Outstanding balances</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                One net balance per person across all unsettled debts.
              </p>
            </div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {visibleBalances.length} of {balances.length}
            </p>
          </div>
          <div className="mt-4">
            <SearchComponent
              searchValue={balanceSearch}
              searchPlaceholder="Search people or debts"
              onSearchChange={setBalanceSearch}
            />
          </div>
          <div className="mt-4 overflow-x-auto">
            {balances.length === 0 ? (
              <EmptyState>No outstanding balances.</EmptyState>
            ) : visibleBalances.length === 0 ? (
              <EmptyState>No balances match your search.</EmptyState>
            ) : (
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">Person</th>
                    <th className="px-3 py-2 text-right font-semibold">
                      They owe me
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">
                      I owe them
                    </th>
                    <th className="px-3 py-2 text-right font-semibold">Net</th>
                    <th className="py-2 pl-3 font-semibold">Records</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visibleBalances.map((balance) => {
                    const isSelected = selectedPersonKey === balance.key;
                    return (
                      <tr
                        key={balance.key}
                        className={`cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
                          isSelected ? "bg-mint dark:bg-emerald-950" : ""
                        }`}
                        onClick={() => {
                          setSelectedPersonKey(balance.key);
                          setSelectedDebtIds(new Set());
                        }}
                      >
                        <td className="py-3 pr-3">
                          <p className="font-semibold">
                            {displayPerson(balance)}
                          </p>
                          {balance.person?.email ? (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {balance.person.email}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {money.format(balance.theyOweMeTotal)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {money.format(balance.iOweThemTotal)}
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-semibold ${
                            balance.netBalance >= 0
                              ? "text-pine dark:text-emerald-400"
                              : "text-coral dark:text-red-400"
                          }`}
                        >
                          {money.format(balance.netBalance)}
                        </td>
                        <td className="py-3 pl-3 text-slate-500 dark:text-slate-400">
                          {balance.theyOweMe.length + balance.iOweThem.length}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        {selectedBalance ? (
          <PersonDebtDetail
            balance={selectedBalance}
            viewerUserId={auth.user?.id}
            selectedDebtIds={selectedDebtIds}
            selectedIOweThem={selectedIOweThem}
            accounts={accountsQuery.data ?? []}
            isActing={isActing}
            highlightedDebtId={highlightedDebtId}
            draftFor={draftFor}
            isSettlementDraftComplete={isSettlementDraftComplete}
            updateDraft={updateDraft}
            categoryOptionsFor={categoryOptionsFor}
            onToggleDebt={toggleDebtSelection}
            onSelectDebts={setDetailSelection}
            onSubmitSettlement={submitSettlement}
            onSubmitBatchSettlement={submitBatchSettlement}
          />
        ) : null}
      </div>
    );
  }

  function renderPendingRequests() {
    const selectedApprovalRequests = visiblePendingForMe.filter((request) =>
      selectedApprovalIds.has(request.id)
    );
    const batchApprovalRequests =
      selectedApprovalRequests.length > 0
        ? selectedApprovalRequests
        : visiblePendingForMe;
    const canSubmitBatchApproval =
      batchApprovalRequests.length > 0 &&
      batchApprovalRequests.every((request) => {
        const draft = approvalDraftFor(request);
        return Boolean(draft.accountId && draft.categoryId);
      });
    const allVisibleApprovalsSelected =
      visiblePendingForMe.length > 0 &&
      visiblePendingForMe.every((request) =>
        selectedApprovalIds.has(request.id)
      );

    return (
      <Card>
        <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold">
              Pending settlement requests
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Review outgoing requests and approvals waiting on you.
            </p>
          </div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {visiblePendingFromMe.length + visiblePendingForMe.length} of{" "}
            {pendingFromMe.length + pendingForMe.length}
          </p>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="grid gap-3">
            <div>
              <h3 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">
                Requests by me
              </h3>
              <div className="mt-3">
                <SearchComponent
                  searchValue={pendingFromMeSearch}
                  searchPlaceholder="Search requests by me"
                  onSearchChange={setPendingFromMeSearch}
                />
              </div>
            </div>
            {pendingFromMe.length === 0 ? (
              <EmptyState>No outgoing requests.</EmptyState>
            ) : visiblePendingFromMe.length === 0 ? (
              <EmptyState>No requests match your search.</EmptyState>
            ) : (
              visiblePendingFromMe.map((request) => (
                <SettlementRequestCard
                  key={request.id}
                  request={request}
                  isHighlighted={highlightedSettlementId === request.id}
                />
              ))
            )}
          </div>
          <div className="grid gap-3">
            <div>
              <h3 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">
                Awaiting my approval
              </h3>
              <div className="mt-3">
                <SearchComponent
                  searchValue={pendingForMeSearch}
                  searchPlaceholder="Search approvals"
                  onSearchChange={setPendingForMeSearch}
                />
              </div>
            </div>
            {pendingForMe.length > 0 ? (
              <div className="grid w-full gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-800 sm:grid-cols-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={
                    visiblePendingForMe.length === 0 ||
                    allVisibleApprovalsSelected
                  }
                  onClick={() => setApprovalSelection(visiblePendingForMe, true)}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={selectedApprovalIds.size === 0}
                  onClick={() => setSelectedApprovalIds(new Set())}
                >
                  Clear selection
                </Button>
                <Button
                  type="button"
                  className="w-full"
                  disabled={isActing || !canSubmitBatchApproval}
                  onClick={() => submitBatchApproval(batchApprovalRequests)}
                >
                  {selectedApprovalRequests.length > 0
                    ? "Settle selected"
                    : "Settle all"}
                </Button>
              </div>
            ) : null}
            {pendingForMe.length === 0 ? (
              <EmptyState>No requests to review.</EmptyState>
            ) : visiblePendingForMe.length === 0 ? (
              <EmptyState>No requests match your search.</EmptyState>
            ) : (
              visiblePendingForMe.map((request) => (
                <SettlementRequestCard
                  key={request.id}
                  request={request}
                  isHighlighted={highlightedSettlementId === request.id}
                  selectable
                  isSelected={selectedApprovalIds.has(request.id)}
                  onSelectedChange={() => toggleApprovalSelection(request.id)}
                  actions={
                    <ApprovalActions
                      request={request}
                      accounts={accountsQuery.data ?? []}
                      incomeCategories={incomeCategoryOptionsFor(request)}
                      expenseOffsetCategories={expenseOffsetCategoryOptionsFor(
                        request
                      )}
                      draft={approvalDraftFor(request)}
                      isActing={isActing}
                      onDraftChange={(field, value) =>
                        updateApprovalDraft(request, field, value)
                      }
                      onApprove={(event) => {
                        event.preventDefault();
                        approveSettlement.mutate({
                          settlementId: request.id,
                          draft: approvalDraftFor(request)
                        });
                      }}
                      onReject={() => rejectSettlement.mutate(request.id)}
                    />
                  }
                />
              ))
            )}
          </div>
        </div>
      </Card>
    );
  }

  function renderSettledDebts() {
    return (
      <Card>
        <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold">Settled history</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Completed shared-expense debts.
            </p>
          </div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {visibleSettledDebts.length} of {(debts?.settledDebts ?? []).length}
          </p>
        </div>
        <div className="mt-4">
          <SearchComponent
            searchValue={settledSearch}
            searchPlaceholder="Search settled debts"
            onSearchChange={setSettledSearch}
          />
        </div>
        <div className="mt-4 grid gap-3">
          {(debts?.settledDebts ?? []).length === 0 ? (
            <EmptyState>No settled debts yet.</EmptyState>
          ) : visibleSettledDebts.length === 0 ? (
            <EmptyState>No settled debts match your search.</EmptyState>
          ) : (
            visibleSettledDebts.map((debt) => (
              <DebtSummaryCard
                key={debt.id}
                debt={debt}
                viewerUserId={auth.user?.id}
                isHighlighted={highlightedDebtId === debt.id}
              />
            ))
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        <div
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
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

        <div role="tabpanel">
          {activeTab === "balances" ? renderBalances() : null}
          {activeTab === "pending" ? renderPendingRequests() : null}
          {activeTab === "settled" ? renderSettledDebts() : null}
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

function PersonDebtDetail({
  balance,
  viewerUserId,
  selectedDebtIds,
  selectedIOweThem,
  accounts,
  isActing,
  highlightedDebtId,
  draftFor,
  isSettlementDraftComplete,
  updateDraft,
  categoryOptionsFor,
  onToggleDebt,
  onSelectDebts,
  onSubmitSettlement,
  onSubmitBatchSettlement
}: {
  balance: PersonBalance;
  viewerUserId?: string;
  selectedDebtIds: Set<string>;
  selectedIOweThem: Debt[];
  accounts: Account[];
  isActing: boolean;
  highlightedDebtId?: string | null;
  draftFor: (debt: Debt) => SettlementDraft;
  isSettlementDraftComplete: (debt: Debt) => boolean;
  updateDraft: (
    debt: Debt,
    field: keyof SettlementDraft,
    value: string
  ) => void;
  categoryOptionsFor: (debt: Debt) => Category[];
  onToggleDebt: (debtId: string) => void;
  onSelectDebts: (debts: Debt[], selected: boolean) => void;
  onSubmitSettlement: (event: FormEvent, debt: Debt) => Promise<void>;
  onSubmitBatchSettlement: (event: FormEvent) => Promise<void>;
}) {
  const selectableIOweThem = balance.iOweThem.filter(
    (debt) => availableSettlementAmount(debt) > 0
  );
  const selectedBatchTotal = selectedIOweThem.reduce(
    (total, debt) => total + (Number(draftFor(debt).amount) || 0),
    0
  );
  const selectedDraftsComplete =
    selectedIOweThem.length > 0 &&
    selectedIOweThem.every(isSettlementDraftComplete);
  const batchValidationMessage =
    selectedIOweThem.length > 0 && !selectedDraftsComplete
      ? "Complete amount, account, and category for every selected debt before requesting settlement."
      : "";

  return (
    <Card>
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-lg font-semibold">{displayPerson(balance)}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Net balance {money.format(balance.netBalance)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:text-right">
          <div>
            <p className="font-semibold">
              {money.format(balance.theyOweMeTotal)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              They owe me
            </p>
          </div>
          <div>
            <p className="font-semibold">
              {money.format(balance.iOweThemTotal)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              I owe them
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5">
        <DebtTable
          title="They Owe Me"
          debts={balance.theyOweMe}
          viewerUserId={viewerUserId}
          selectedDebtIds={selectedDebtIds}
          highlightedDebtId={highlightedDebtId}
          emptyText="This person does not owe you on any open debt records."
          onToggleDebt={onToggleDebt}
          onSelectDebts={onSelectDebts}
        />

        <div className="grid gap-3">
          <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-end">
            <div>
              <h3 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">
                Batch settlement
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {selectedIOweThem.length} selected ·{" "}
                {money.format(selectedBatchTotal)}
              </p>
            </div>
            <form
              className="grid gap-2 sm:grid-cols-3"
              onSubmit={onSubmitBatchSettlement}
            >
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={selectableIOweThem.length === 0}
                onClick={() => onSelectDebts(selectableIOweThem, true)}
              >
                Select All
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={selectedIOweThem.length === 0}
                onClick={() => onSelectDebts(selectableIOweThem, false)}
              >
                Clear Selection
              </Button>
              <Button
                type="submit"
                className="w-full"
                disabled={isActing || !selectedDraftsComplete}
              >
                Request Selected
              </Button>
              {batchValidationMessage ? (
                <p className="text-sm text-coral dark:text-red-400 sm:col-span-3">
                  {batchValidationMessage}
                </p>
              ) : null}
            </form>
          </div>

          <DebtTable
            title="I Owe Them"
            debts={balance.iOweThem}
            viewerUserId={viewerUserId}
            selectedDebtIds={selectedDebtIds}
            highlightedDebtId={highlightedDebtId}
            emptyText="You do not owe this person on any open debt records."
            selectableDebts={selectableIOweThem}
            onToggleDebt={onToggleDebt}
            onSelectDebts={onSelectDebts}
            renderAction={(debt) => {
              const draft = draftFor(debt);
              const availableAmount = availableSettlementAmount(debt);
              const settlementCategoryOptions = categoryOptionsFor(debt);

              return availableAmount <= 0 ? (
                <EmptyState>
                  A settlement request is waiting for approval.
                </EmptyState>
              ) : (
                <form
                  className="grid min-w-0 gap-2"
                  onSubmit={(event) => onSubmitSettlement(event, debt)}
                >
                  <TextInput
                    label="Amount"
                    type="number"
                    min="0.01"
                    max={availableAmount}
                    step="0.01"
                    value={draft.amount}
                    onChange={(event) =>
                      updateDraft(debt, "amount", event.target.value)
                    }
                    required
                  />
                  <SelectField
                    label="Account"
                    value={draft.accountId}
                    onChange={(event) =>
                      updateDraft(debt, "accountId", event.target.value)
                    }
                    required
                  >
                    <option value="">Select account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField
                    label="Category"
                    value={draft.categoryId}
                    onChange={(event) =>
                      updateDraft(debt, "categoryId", event.target.value)
                    }
                    required
                  >
                    <option value="">Select category</option>
                    {settlementCategoryOptions.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </SelectField>
                  <div className="flex items-end">
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isActing}
                    >
                      Request settlement
                    </Button>
                  </div>
                </form>
              );
            }}
          />
        </div>
      </div>
    </Card>
  );
}

function DebtTable({
  title,
  debts,
  viewerUserId,
  selectedDebtIds,
  highlightedDebtId,
  emptyText,
  selectableDebts = debts,
  onToggleDebt,
  onSelectDebts,
  renderAction
}: {
  title: string;
  debts: Debt[];
  viewerUserId?: string;
  selectedDebtIds: Set<string>;
  highlightedDebtId?: string | null;
  emptyText: string;
  selectableDebts?: Debt[];
  onToggleDebt: (debtId: string) => void;
  onSelectDebts: (debts: Debt[], selected: boolean) => void;
  renderAction?: (debt: Debt) => ReactNode;
}) {
  const selectableIds = new Set(selectableDebts.map((debt) => debt.id));
  const allSelected =
    selectableDebts.length > 0 &&
    selectableDebts.every((debt) => selectedDebtIds.has(debt.id));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">
          {title}
        </h3>
        <Button
          type="button"
          variant="secondary"
          className="min-h-8 px-3 py-1 text-xs"
          disabled={selectableDebts.length === 0}
          onClick={() => onSelectDebts(selectableDebts, !allSelected)}
        >
          {allSelected ? "Clear Selection" : "Select All"}
        </Button>
      </div>
      {debts.length === 0 ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : (
        <div className="rounded-md border border-slate-200 dark:border-slate-800">
          <table className="block w-full text-left text-sm lg:table">
            <thead className="hidden bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950 dark:text-slate-400 lg:table-header-group">
              <tr>
                <th className="w-10 px-3 py-2 font-semibold">Select</th>
                <th className="px-3 py-2 font-semibold">Debt</th>
                <th className="w-32 px-3 py-2 text-right font-semibold">
                  Outstanding
                </th>
                <th className="w-36 px-3 py-2 font-semibold">Status</th>
                {renderAction ? (
                  <th className="w-80 px-3 py-2 font-semibold">Settlement</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="grid gap-3 p-3 lg:table-row-group lg:divide-y lg:divide-slate-100 lg:p-0 dark:lg:divide-slate-800">
              {debts.map((debt) => {
                const isSelectable = selectableIds.has(debt.id);
                return (
                  <tr
                    key={debt.id}
                    id={`debt-${debt.id}`}
                    className={`block rounded-md border transition lg:table-row lg:rounded-none lg:border-0 ${
                      highlightedDebtId === debt.id
                        ? "border-pine bg-mint dark:border-emerald-500 dark:bg-emerald-950"
                        : "border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    <td className="block px-3 pt-3 align-top lg:table-cell lg:py-3">
                      <span className="mb-1 block text-xs font-semibold uppercase text-slate-500 lg:hidden dark:text-slate-400">
                        Select
                      </span>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-pine focus:ring-mint disabled:opacity-50 dark:border-slate-700"
                        checked={selectedDebtIds.has(debt.id)}
                        disabled={!isSelectable}
                        onChange={() => onToggleDebt(debt.id)}
                        aria-label={`Select ${debtTitle(debt)}`}
                      />
                    </td>
                    <td className="block px-3 py-3 align-top lg:table-cell">
                      <p className="font-semibold">{debtTitle(debt)}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {debtDescription(debt, viewerUserId)}
                      </p>
                    </td>
                    <td className="block px-3 py-2 align-top font-semibold lg:table-cell lg:py-3 lg:text-right">
                      <span className="mb-1 block text-xs font-semibold uppercase text-slate-500 lg:hidden dark:text-slate-400">
                        Outstanding
                      </span>
                      {money.format(debt.outstandingAmount)}
                    </td>
                    <td className="block px-3 py-2 align-top text-slate-500 lg:table-cell lg:py-3 dark:text-slate-400">
                      <span className="mb-1 block text-xs font-semibold uppercase text-slate-500 lg:hidden dark:text-slate-400">
                        Status
                      </span>
                      {statusLabel(debt)}
                    </td>
                    {renderAction ? (
                      <td className="block px-3 pb-3 pt-2 align-top lg:table-cell lg:py-3">
                        <span className="mb-2 block text-xs font-semibold uppercase text-slate-500 lg:hidden dark:text-slate-400">
                          Settlement
                        </span>
                        {renderAction(debt)}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DebtSummaryCard({
  debt,
  viewerUserId,
  isHighlighted
}: {
  debt: Debt;
  viewerUserId?: string;
  isHighlighted?: boolean;
}) {
  return (
    <div
      id={`debt-${debt.id}`}
      className={`rounded-md border p-3 transition ${
        isHighlighted
          ? "border-pine bg-mint dark:border-emerald-500 dark:bg-emerald-950"
          : "border-slate-200 dark:border-slate-800"
      }`}
    >
      <div className="flex flex-col justify-between gap-2 sm:flex-row">
        <div>
          <p className="font-semibold">{debtTitle(debt)}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {debtDescription(debt, viewerUserId)}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="font-semibold">
            {money.format(debt.outstandingAmount)}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {statusLabel(debt)}
          </p>
        </div>
      </div>
    </div>
  );
}

function ApprovalActions({
  request,
  accounts,
  incomeCategories,
  expenseOffsetCategories,
  draft,
  isActing,
  onDraftChange,
  onApprove,
  onReject
}: {
  request: SettlementRequest;
  accounts: Account[];
  incomeCategories: Category[];
  expenseOffsetCategories: Category[];
  draft: SettlementApprovalDraft;
  isActing: boolean;
  onDraftChange: (field: keyof SettlementApprovalDraft, value: string) => void;
  onApprove: (event: FormEvent) => void;
  onReject: () => void;
}) {
  const originalType =
    request.sharedExpenseParticipant?.sharedExpense.transaction?.type;

  return (
    <form
      className="grid w-full max-w-md gap-3"
      onSubmit={onApprove}
    >
      <SelectField
        label="Deposit account"
        value={draft.accountId}
        onChange={(event) => onDraftChange("accountId", event.target.value)}
        required
      >
        <option value="">Select account</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Income category"
        value={draft.categoryId}
        onChange={(event) => onDraftChange("categoryId", event.target.value)}
        required
      >
        <option value="">Select category</option>
        {incomeCategories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Offset category"
        value={draft.expenseOffsetCategoryId}
        onChange={(event) =>
          onDraftChange("expenseOffsetCategoryId", event.target.value)
        }
        disabled={originalType !== "expense"}
      >
        <option value="">No offset</option>
        {expenseOffsetCategories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </SelectField>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="submit"
          className="w-full"
          disabled={isActing || !draft.accountId || !draft.categoryId}
        >
          Approve
        </Button>
        <Button
          type="button"
          variant="danger"
          className="w-full"
          disabled={isActing}
          onClick={onReject}
        >
          Reject
        </Button>
      </div>
    </form>
  );
}

function SettlementRequestCard({
  request,
  isHighlighted,
  selectable,
  isSelected,
  onSelectedChange,
  actions
}: {
  request: SettlementRequest;
  isHighlighted?: boolean;
  selectable?: boolean;
  isSelected?: boolean;
  onSelectedChange?: () => void;
  actions?: ReactNode;
}) {
  const debt = request.sharedExpenseParticipant;

  return (
    <div
      id={`settlement-${request.id}`}
      className={`rounded-md border p-3 transition ${
        isHighlighted
          ? "border-pine bg-mint dark:border-emerald-500 dark:bg-emerald-950"
          : "border-slate-200 dark:border-slate-800"
      }`}
    >
      <div className="flex flex-col justify-between gap-2 sm:flex-row">
        <div className="flex gap-3">
          {selectable ? (
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 text-pine focus:ring-mint dark:border-slate-700"
              checked={Boolean(isSelected)}
              onChange={onSelectedChange}
              aria-label={`Select ${debt?.sharedExpense.title ?? "settlement request"}`}
            />
          ) : null}
          <div>
            <p className="font-semibold">
              {debt?.sharedExpense.title ?? "Settlement request"}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {request.debtor?.name ?? "Debtor"} requested{" "}
              {money.format(request.amount)}
            </p>
          </div>
        </div>
        <p className="text-sm font-semibold">{request.status}</p>
      </div>
      {request.note ? (
        <p className="mt-2 rounded-md bg-slate-50 p-2 text-sm dark:bg-slate-950">
          {request.note}
        </p>
      ) : null}
      {actions ? <div className="mt-3">{actions}</div> : null}
    </div>
  );
}
