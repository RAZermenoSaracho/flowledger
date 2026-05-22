import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { SelectField, TextArea, TextInput } from "../components/FormField";
import { SearchComponent } from "../components/SearchComponent";
import { useAuth } from "../hooks/useAuth";
import { apiRequest } from "../services/api";
import type { Account, Category, Debt, SettlementRequest } from "../types/api";

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
  note: string;
};

type RegistrationDraft = {
  accountId: string;
  categoryId: string;
  date: string;
  notes: string;
};

type DebtsTab = "iOwe" | "owedToMe" | "pending" | "settled";

const REGISTERED_SETTLEMENTS_KEY = "flowledger.registeredSettlements";

const debtsTabs: { id: DebtsTab; label: string }[] = [
  { id: "iOwe", label: "I owe" },
  { id: "owedToMe", label: "Owed to me" },
  { id: "pending", label: "Pending settlement requests" },
  { id: "settled", label: "Settled debts" }
];

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function readHiddenSettlementIds() {
  try {
    const value = localStorage.getItem(REGISTERED_SETTLEMENTS_KEY);
    return new Set<string>(value ? (JSON.parse(value) as string[]) : []);
  } catch {
    return new Set<string>();
  }
}

function writeHiddenSettlementIds(ids: Set<string>) {
  localStorage.setItem(REGISTERED_SETTLEMENTS_KEY, JSON.stringify(Array.from(ids)));
}

function debtTitle(debt: Debt) {
  return debt.sharedExpense.title;
}

function participantName(debt: Debt) {
  return debt.user?.name ?? debt.participantName;
}

function partyName(debt: Debt, userId?: string | null) {
  if (!userId) return undefined;
  if (userId === debt.sharedExpense.ownerUserId) return debt.sharedExpense.owner?.name;
  if (userId === debt.userId) return participantName(debt);
  if (!debt.userId && (userId === debt.debtorUserId || userId === debt.creditorUserId)) {
    return participantName(debt);
  }
  return undefined;
}

function transactionTypeLabel(debt: Debt) {
  return debt.sharedExpense.transaction?.type === "income" ? "income split" : "expense split";
}

function debtDescription(debt: Debt, viewerUserId?: string) {
  const otherParty =
    debt.debtorUserId === viewerUserId
      ? partyName(debt, debt.creditorUserId)
      : partyName(debt, debt.debtorUserId);

  return `${otherParty ?? "Unknown user"} · ${transactionTypeLabel(debt)} · ${money.format(
    debt.paidAmount
  )} settled of ${money.format(debt.shareAmount)}`;
}

function statusLabel(debt: Debt) {
  if (debt.outstandingAmount <= 0) return "settled";
  if (debt.pendingSettlementAmount > 0) return "settlement pending";
  return debt.status;
}

function matchesSearch(parts: Array<string | number | null | undefined>, search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return parts.some((part) => String(part ?? "").toLowerCase().includes(query));
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

function settlementRequestMatchesSearch(request: SettlementRequest, search: string) {
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

function DebtCard({
  debt,
  viewerUserId,
  children
}: {
  debt: Debt;
  viewerUserId?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-col justify-between gap-2 sm:flex-row">
        <div>
          <p className="font-semibold">{debtTitle(debt)}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {debtDescription(debt, viewerUserId)}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="font-semibold">{money.format(debt.outstandingAmount)}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {statusLabel(debt)}
          </p>
        </div>
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-500 dark:text-slate-400">{children}</p>;
}

export function DebtsPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, SettlementDraft>>({});
  const [registrationDrafts, setRegistrationDrafts] = useState<
    Record<string, RegistrationDraft>
  >({});
  const [hiddenSettlementIds, setHiddenSettlementIds] = useState(readHiddenSettlementIds);
  const [activeTab, setActiveTab] = useState<DebtsTab>("iOwe");
  const [iOweSearch, setIOweSearch] = useState("");
  const [owedToMeSearch, setOwedToMeSearch] = useState("");
  const [pendingFromMeSearch, setPendingFromMeSearch] = useState("");
  const [pendingForMeSearch, setPendingForMeSearch] = useState("");
  const [settledSearch, setSettledSearch] = useState("");

  const debtsQuery = useQuery({
    queryKey: ["debts"],
    queryFn: async () => apiRequest<DebtsResponse>("/debts")
  });
  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => (await apiRequest<{ accounts: Account[] }>("/accounts")).accounts
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await apiRequest<{ categories: Category[] }>("/categories")).categories
  });

  const debts = debtsQuery.data;
  const expenseCategories = useMemo(
    () => (categoriesQuery.data ?? []).filter((category) => category.type === "expense"),
    [categoriesQuery.data]
  );
  const approvedForRegistration = useMemo(
    () =>
      (debts?.approvedSettlementRequests ?? []).filter(
        (request) =>
          request.debtorUserId === auth.user?.id && !hiddenSettlementIds.has(request.id)
      ),
    [auth.user?.id, debts?.approvedSettlementRequests, hiddenSettlementIds]
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
  const visibleIOwe = useMemo(
    () =>
      (debts?.iOwe ?? []).filter((debt) =>
        debtMatchesSearch(debt, iOweSearch, auth.user?.id)
      ),
    [auth.user?.id, debts?.iOwe, iOweSearch]
  );
  const visibleOwedToMe = useMemo(
    () =>
      (debts?.owedToMe ?? []).filter((debt) =>
        debtMatchesSearch(debt, owedToMeSearch, auth.user?.id)
      ),
    [auth.user?.id, debts?.owedToMe, owedToMeSearch]
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

  const requestSettlement = useMutation({
    mutationFn: ({ debtId, draft }: { debtId: string; draft: SettlementDraft }) =>
      apiRequest(`/debts/${debtId}/settlement-request`, {
        method: "POST",
        body: {
          amount: Number(draft.amount),
          note: draft.note.trim() || null
        }
      }),
    onSuccess: async (_data, variables) => {
      setDrafts((current) => {
        const next = { ...current };
        delete next[variables.debtId];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
    }
  });
  const approveSettlement = useMutation({
    mutationFn: (settlementId: string) =>
      apiRequest(`/settlements/${settlementId}/approve`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
    }
  });
  const rejectSettlement = useMutation({
    mutationFn: (settlementId: string) =>
      apiRequest(`/settlements/${settlementId}/reject`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
    }
  });
  const markDebtSettled = useMutation({
    mutationFn: (debtId: string) =>
      apiRequest(`/debts/${debtId}/settle`, {
        method: "POST",
        body: {}
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
    }
  });
  const createSettlementTransaction = useMutation({
    mutationFn: ({
      request,
      draft
    }: {
      request: SettlementRequest;
      draft: RegistrationDraft;
    }) =>
      apiRequest("/transactions", {
        method: "POST",
        body: {
          name: `Settlement: ${
            request.sharedExpenseParticipant?.sharedExpense.title ?? "Shared expense"
          }`,
          amount: request.amount,
          type: "expense",
          date: draft.date,
          accountId: draft.accountId || null,
          categoryId: draft.categoryId || null,
          notes: draft.notes.trim() || null
        }
      }),
    onSuccess: async (_data, variables) => {
      hideSettlementRegistration(variables.request.id);
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  function draftFor(debt: Debt) {
    return (
      drafts[debt.id] ?? {
        amount: String(Math.max(0, debt.outstandingAmount - debt.pendingSettlementAmount)),
        note: ""
      }
    );
  }

  function updateDraft(debtId: string, field: keyof SettlementDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [debtId]: {
        ...(current[debtId] ?? { amount: "", note: "" }),
        [field]: value
      }
    }));
  }

  function registrationDraftFor(request: SettlementRequest) {
    return (
      registrationDrafts[request.id] ?? {
        accountId: accountsQuery.data?.[0]?.id ?? "",
        categoryId: expenseCategories[0]?.id ?? "",
        date: todayInputValue(),
        notes: request.note ?? ""
      }
    );
  }

  function updateRegistrationDraft(
    settlementId: string,
    field: keyof RegistrationDraft,
    value: string
  ) {
    setRegistrationDrafts((current) => ({
      ...current,
      [settlementId]: {
        ...(current[settlementId] ?? {
          accountId: accountsQuery.data?.[0]?.id ?? "",
          categoryId: expenseCategories[0]?.id ?? "",
          date: todayInputValue(),
          notes: ""
        }),
        [field]: value
      }
    }));
  }

  function hideSettlementRegistration(settlementId: string) {
    setHiddenSettlementIds((current) => {
      const next = new Set(current);
      next.add(settlementId);
      writeHiddenSettlementIds(next);
      return next;
    });
  }

  async function submitSettlement(event: FormEvent, debt: Debt) {
    event.preventDefault();
    await requestSettlement.mutateAsync({ debtId: debt.id, draft: draftFor(debt) });
  }

  async function submitSettlementTransaction(event: FormEvent, request: SettlementRequest) {
    event.preventDefault();
    await createSettlementTransaction.mutateAsync({
      request,
      draft: registrationDraftFor(request)
    });
  }

  const isActing =
    requestSettlement.isPending ||
    approveSettlement.isPending ||
    rejectSettlement.isPending ||
    markDebtSettled.isPending ||
    createSettlementTransaction.isPending;

  function renderIOwe() {
    return (
      <Card>
        <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold">I owe</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Debts where you owe money.
            </p>
          </div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {visibleIOwe.length} of {(debts?.iOwe ?? []).length}
          </p>
        </div>
        <div className="mt-4">
          <SearchComponent
            searchValue={iOweSearch}
            searchPlaceholder="Search debts I owe"
            onSearchChange={setIOweSearch}
          />
        </div>
        <div className="mt-4 grid gap-3">
          {(debts?.iOwe ?? []).length === 0 ? (
            <EmptyState>No outstanding debts.</EmptyState>
          ) : visibleIOwe.length === 0 ? (
            <EmptyState>No debts match your search.</EmptyState>
          ) : (
            visibleIOwe.map((debt) => {
              const draft = draftFor(debt);
              const availableAmount = debt.outstandingAmount - debt.pendingSettlementAmount;

              return (
                <DebtCard key={debt.id} debt={debt} viewerUserId={auth.user?.id}>
                  {availableAmount <= 0 ? (
                    <EmptyState>A settlement request is waiting for approval.</EmptyState>
                  ) : (
                    <form
                      className="grid gap-3 md:grid-cols-[minmax(0,12rem)_1fr_auto]"
                      onSubmit={(event) => submitSettlement(event, debt)}
                    >
                      <TextInput
                        label="Settlement amount"
                        type="number"
                        min="0.01"
                        max={availableAmount}
                        step="0.01"
                        value={draft.amount}
                        onChange={(event) => updateDraft(debt.id, "amount", event.target.value)}
                        required
                      />
                      <TextArea
                        label="Note"
                        value={draft.note}
                        onChange={(event) => updateDraft(debt.id, "note", event.target.value)}
                        placeholder="Optional"
                      />
                      <div className="flex items-end">
                        <Button type="submit" className="w-full" disabled={isActing}>
                          Request settlement
                        </Button>
                      </div>
                    </form>
                  )}
                </DebtCard>
              );
            })
          )}
        </div>
      </Card>
    );
  }

  function renderOwedToMe() {
    return (
      <Card>
        <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold">Owed to me</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Debts where other users owe you.
            </p>
          </div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {visibleOwedToMe.length} of {(debts?.owedToMe ?? []).length}
          </p>
        </div>
        <div className="mt-4">
          <SearchComponent
            searchValue={owedToMeSearch}
            searchPlaceholder="Search debts owed to me"
            onSearchChange={setOwedToMeSearch}
          />
        </div>
        <div className="mt-4 grid gap-3">
          {(debts?.owedToMe ?? []).length === 0 ? (
            <EmptyState>No one currently owes you.</EmptyState>
          ) : visibleOwedToMe.length === 0 ? (
            <EmptyState>No debts match your search.</EmptyState>
          ) : (
            visibleOwedToMe.map((debt) => {
              const hasPendingRequest = debt.pendingSettlementAmount > 0;
              return (
                <DebtCard key={debt.id} debt={debt} viewerUserId={auth.user?.id}>
                  {hasPendingRequest ? (
                    <EmptyState>Review the pending settlement request below.</EmptyState>
                  ) : (
                    <div className="flex justify-start">
                      <Button
                        type="button"
                        disabled={isActing}
                        onClick={() => markDebtSettled.mutate(debt.id)}
                      >
                        Mark paid
                      </Button>
                    </div>
                  )}
                </DebtCard>
              );
            })
          )}
        </div>
      </Card>
    );
  }

  function renderPendingRequests() {
    return (
      <Card>
        <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold">Pending settlement requests</h2>
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
                <SettlementRequestCard key={request.id} request={request} />
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
              <DebtCard key={debt.id} debt={debt} viewerUserId={auth.user?.id} />
            ))
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      {approvedForRegistration.length > 0 ? (
        <Card>
          <h2 className="text-lg font-semibold">Register approved settlements</h2>
          <div className="mt-4 grid gap-3">
            {approvedForRegistration.map((request) => {
              const draft = registrationDraftFor(request);
              return (
                <SettlementRegistrationCard
                  key={request.id}
                  request={request}
                  draft={draft}
                  accounts={accountsQuery.data ?? []}
                  categories={expenseCategories}
                  disabled={isActing}
                  onDismiss={() => hideSettlementRegistration(request.id)}
                  onChange={(field, value) =>
                    updateRegistrationDraft(request.id, field, value)
                  }
                  onSubmit={(event) => submitSettlementTransaction(event, request)}
                />
              );
            })}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4">
        <div
          className="grid grid-cols-2 gap-2 lg:grid-cols-4"
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
          {activeTab === "iOwe" ? renderIOwe() : null}
          {activeTab === "owedToMe" ? renderOwedToMe() : null}
          {activeTab === "pending" ? renderPendingRequests() : null}
          {activeTab === "settled" ? renderSettledDebts() : null}
        </div>
      </div>

      {debtsQuery.isLoading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading debts...</p>
      ) : null}
      {debtsQuery.isError ? (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">
          Could not load debts.
        </p>
      ) : null}
    </div>
  );
}

function SettlementRegistrationCard({
  request,
  draft,
  accounts,
  categories,
  disabled,
  onChange,
  onDismiss,
  onSubmit
}: {
  request: SettlementRequest;
  draft: RegistrationDraft;
  accounts: Account[];
  categories: Category[];
  disabled: boolean;
  onChange: (field: keyof RegistrationDraft, value: string) => void;
  onDismiss: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const debt = request.sharedExpenseParticipant;

  return (
    <form
      className="grid gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-800"
      onSubmit={onSubmit}
    >
      <div className="flex flex-col justify-between gap-2 sm:flex-row">
        <div>
          <p className="font-semibold">{debt?.sharedExpense.title ?? "Approved settlement"}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Approved payment of {money.format(request.amount)}
          </p>
        </div>
        <Button type="button" variant="secondary" disabled={disabled} onClick={onDismiss}>
          Skip
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField
          label="Account"
          value={draft.accountId}
          onChange={(event) => onChange("accountId", event.target.value)}
        >
          <option value="">No account</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Category"
          value={draft.categoryId}
          onChange={(event) => onChange("categoryId", event.target.value)}
        >
          <option value="">No category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>
        <TextInput
          label="Date"
          type="date"
          value={draft.date}
          onChange={(event) => onChange("date", event.target.value)}
          required
        />
        <TextArea
          label="Notes"
          value={draft.notes}
          onChange={(event) => onChange("notes", event.target.value)}
          placeholder="Optional"
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={disabled}>
          Create transaction
        </Button>
      </div>
    </form>
  );
}

function SettlementRequestCard({
  request,
  actions
}: {
  request: SettlementRequest;
  actions?: ReactNode;
}) {
  const debt = request.sharedExpenseParticipant;

  return (
    <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex flex-col justify-between gap-2 sm:flex-row">
        <div>
          <p className="font-semibold">{debt?.sharedExpense.title ?? "Settlement request"}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {request.debtor?.name ?? "Debtor"} requested {money.format(request.amount)}
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
