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

type BatchSettlementDraft = {
  accountId: string;
  note: string;
  paymentInfo: string;
};

type DebtsTab = "balances" | "pending" | "settled";

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
  { id: "balances", label: "Outstanding balances" },
  { id: "pending", label: "Pending settlement requests" },
  { id: "settled", label: "Settled debts" }
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
  const [batchDraft, setBatchDraft] = useState<BatchSettlementDraft>({
    accountId: "",
    note: "",
    paymentInfo: ""
  });
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
    const defaultAccountId = accountsQuery.data?.[0]?.id;
    if (!batchDraft.accountId && defaultAccountId) {
      setBatchDraft((current) => ({
        ...current,
        accountId: defaultAccountId
      }));
    }
  }, [accountsQuery.data, batchDraft.accountId]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab === "pending" || requestedTab === "settled") {
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
    mutationFn: async ({
      selectedDebts,
      draft
    }: {
      selectedDebts: Debt[];
      draft: BatchSettlementDraft;
    }) => {
      await Promise.all(
        selectedDebts.map((debt) =>
          createSettlementRequest(debt.id, {
            ...defaultDraftFor(debt),
            amount: String(availableSettlementAmount(debt)),
            accountId: draft.accountId,
            note: draft.note,
            paymentInfo: draft.paymentInfo
          })
        )
      );
    },
    onSuccess: async (_data, variables) => {
      const settledIds = new Set(variables.selectedDebts.map((debt) => debt.id));
      setSelectedDebtIds((current) => {
        const next = new Set(current);
        settledIds.forEach((id) => next.delete(id));
        return next;
      });
      setBatchDraft((current) => ({ ...current, note: "", paymentInfo: "" }));
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
    }
  });
  const approveSettlement = useMutation({
    mutationFn: (settlementId: string) =>
      apiRequest(`/settlements/${settlementId}/approve`, { method: "POST" }),
    onSuccess: async () => {
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
      ? originalGroup.categories.filter((category) => category.type === "expense")
      : privateExpenseCategories;
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
    await requestBatchSettlement.mutateAsync({
      selectedDebts: selectedIOweThem,
      draft: batchDraft
    });
  }

  const isActing =
    requestSettlement.isPending ||
    requestBatchSettlement.isPending ||
    approveSettlement.isPending ||
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
            batchDraft={batchDraft}
            accounts={accountsQuery.data ?? []}
            isActing={isActing}
            highlightedDebtId={highlightedDebtId}
            draftFor={draftFor}
            updateDraft={updateDraft}
            categoryOptionsFor={categoryOptionsFor}
            onToggleDebt={toggleDebtSelection}
            onSelectDebts={setDetailSelection}
            onSubmitSettlement={submitSettlement}
            onBatchDraftChange={(field, value) =>
              setBatchDraft((current) => ({ ...current, [field]: value }))
            }
            onSubmitBatchSettlement={submitBatchSettlement}
          />
        ) : null}
      </div>
    );
  }

  function renderPendingRequests() {
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
                  actions={
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        className="w-full sm:w-auto"
                        disabled={isActing}
                        onClick={() => approveSettlement.mutate(request.id)}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        className="w-full sm:w-auto"
                        disabled={isActing}
                        onClick={() => rejectSettlement.mutate(request.id)}
                      >
                        Reject
                      </Button>
                    </div>
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
            <h2 className="text-lg font-semibold">Settled debts</h2>
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
          className="grid grid-cols-1 gap-2 sm:grid-cols-3"
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
  batchDraft,
  accounts,
  isActing,
  highlightedDebtId,
  draftFor,
  updateDraft,
  categoryOptionsFor,
  onToggleDebt,
  onSelectDebts,
  onSubmitSettlement,
  onBatchDraftChange,
  onSubmitBatchSettlement
}: {
  balance: PersonBalance;
  viewerUserId?: string;
  selectedDebtIds: Set<string>;
  selectedIOweThem: Debt[];
  batchDraft: BatchSettlementDraft;
  accounts: Account[];
  isActing: boolean;
  highlightedDebtId?: string | null;
  draftFor: (debt: Debt) => SettlementDraft;
  updateDraft: (debt: Debt, field: keyof SettlementDraft, value: string) => void;
  categoryOptionsFor: (debt: Debt) => Category[];
  onToggleDebt: (debtId: string) => void;
  onSelectDebts: (debts: Debt[], selected: boolean) => void;
  onSubmitSettlement: (event: FormEvent, debt: Debt) => Promise<void>;
  onBatchDraftChange: (field: keyof BatchSettlementDraft, value: string) => void;
  onSubmitBatchSettlement: (event: FormEvent) => Promise<void>;
}) {
  const selectableIOweThem = balance.iOweThem.filter(
    (debt) => availableSettlementAmount(debt) > 0
  );
  const selectedBatchTotal = selectedIOweThem.reduce(
    (total, debt) => total + availableSettlementAmount(debt),
    0
  );

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
            <p className="font-semibold">{money.format(balance.theyOweMeTotal)}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              They owe me
            </p>
          </div>
          <div>
            <p className="font-semibold">{money.format(balance.iOweThemTotal)}</p>
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
              className="grid gap-3 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,1fr)_auto]"
              onSubmit={onSubmitBatchSettlement}
            >
              <SelectField
                label="Source account"
                value={batchDraft.accountId}
                onChange={(event) =>
                  onBatchDraftChange("accountId", event.target.value)
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
              <TextInput
                label="Note"
                value={batchDraft.note}
                onChange={(event) =>
                  onBatchDraftChange("note", event.target.value)
                }
                placeholder="Optional"
              />
              <TextInput
                label="Payment info"
                value={batchDraft.paymentInfo}
                onChange={(event) =>
                  onBatchDraftChange("paymentInfo", event.target.value)
                }
                placeholder="Optional"
              />
              <div className="flex items-end">
                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    isActing ||
                    selectedIOweThem.length === 0 ||
                    !batchDraft.accountId
                  }
                >
                  Request selected
                </Button>
              </div>
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
                <EmptyState>A settlement request is waiting for approval.</EmptyState>
              ) : (
                <form
                  className="grid gap-2 lg:grid-cols-[minmax(0,8rem)_minmax(0,11rem)_minmax(0,11rem)_minmax(0,10rem)_minmax(0,10rem)_auto]"
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
                  >
                    <option value="">No category</option>
                    {settlementCategoryOptions.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </SelectField>
                  <TextInput
                    label="Note"
                    value={draft.note}
                    onChange={(event) =>
                      updateDraft(debt, "note", event.target.value)
                    }
                    placeholder="Optional"
                  />
                  <TextInput
                    label="Payment info"
                    value={draft.paymentInfo}
                    onChange={(event) =>
                      updateDraft(debt, "paymentInfo", event.target.value)
                    }
                    placeholder="Optional"
                  />
                  <div className="flex items-end">
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isActing}
                    >
                      Request
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
          {allSelected ? "Clear" : "Select all"}
        </Button>
      </div>
      {debts.length === 0 ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="w-10 px-3 py-2 font-semibold">Select</th>
                <th className="px-3 py-2 font-semibold">Debt</th>
                <th className="px-3 py-2 text-right font-semibold">
                  Outstanding
                </th>
                <th className="px-3 py-2 font-semibold">Status</th>
                {renderAction ? (
                  <th className="px-3 py-2 font-semibold">Settlement</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {debts.map((debt) => {
                const isSelectable = selectableIds.has(debt.id);
                return (
                  <tr
                    key={debt.id}
                    id={`debt-${debt.id}`}
                    className={
                      highlightedDebtId === debt.id
                        ? "bg-mint dark:bg-emerald-950"
                        : ""
                    }
                  >
                    <td className="px-3 py-3 align-top">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-pine focus:ring-mint disabled:opacity-50 dark:border-slate-700"
                        checked={selectedDebtIds.has(debt.id)}
                        disabled={!isSelectable}
                        onChange={() => onToggleDebt(debt.id)}
                        aria-label={`Select ${debtTitle(debt)}`}
                      />
                    </td>
                    <td className="px-3 py-3 align-top">
                      <p className="font-semibold">{debtTitle(debt)}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {debtDescription(debt, viewerUserId)}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right align-top font-semibold">
                      {money.format(debt.outstandingAmount)}
                    </td>
                    <td className="px-3 py-3 align-top text-slate-500 dark:text-slate-400">
                      {statusLabel(debt)}
                    </td>
                    {renderAction ? (
                      <td className="min-w-[60rem] px-3 py-3 align-top">
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

function SettlementRequestCard({
  request,
  isHighlighted,
  actions
}: {
  request: SettlementRequest;
  isHighlighted?: boolean;
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
        <div>
          <p className="font-semibold">
            {debt?.sharedExpense.title ?? "Settlement request"}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {request.debtor?.name ?? "Debtor"} requested{" "}
            {money.format(request.amount)}
          </p>
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
