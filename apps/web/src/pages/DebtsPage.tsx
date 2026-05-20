import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { TextArea, TextInput } from "../components/FormField";
import { useAuth } from "../hooks/useAuth";
import { apiRequest } from "../services/api";
import type { Debt, SettlementRequest } from "../types/api";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

type DebtsResponse = {
  iOwe: Debt[];
  owedToMe: Debt[];
  pendingSettlementRequests: SettlementRequest[];
  settledDebts: Debt[];
};

type SettlementDraft = {
  amount: string;
  note: string;
};

function debtTitle(debt: Debt) {
  return debt.sharedExpense.title;
}

function debtDescription(debt: Debt, viewerUserId?: string) {
  const otherParty =
    debt.userId === viewerUserId
      ? debt.sharedExpense.owner?.name
      : debt.user?.name ?? debt.participantName;

  return `${otherParty ?? "Unknown user"} · ${money.format(debt.paidAmount)} paid of ${money.format(
    debt.shareAmount
  )}`;
}

function statusLabel(debt: Debt) {
  if (debt.outstandingAmount <= 0) return "settled";
  if (debt.pendingSettlementAmount > 0) return "settlement pending";
  return debt.status;
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

  const debtsQuery = useQuery({
    queryKey: ["debts"],
    queryFn: async () => apiRequest<DebtsResponse>("/debts")
  });

  const debts = debtsQuery.data;
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

  async function submitSettlement(event: FormEvent, debt: Debt) {
    event.preventDefault();
    await requestSettlement.mutateAsync({ debtId: debt.id, draft: draftFor(debt) });
  }

  const isActing =
    requestSettlement.isPending || approveSettlement.isPending || rejectSettlement.isPending;

  return (
    <div className="grid gap-6">
      <Card>
        <h2 className="text-lg font-semibold">I owe</h2>
        <div className="mt-4 grid gap-3">
          {(debts?.iOwe ?? []).length === 0 ? (
            <EmptyState>No outstanding debts.</EmptyState>
          ) : (
            debts?.iOwe.map((debt) => {
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

      <Card>
        <h2 className="text-lg font-semibold">Owed to me</h2>
        <div className="mt-4 grid gap-3">
          {(debts?.owedToMe ?? []).length === 0 ? (
            <EmptyState>No one currently owes you.</EmptyState>
          ) : (
            debts?.owedToMe.map((debt) => (
              <DebtCard key={debt.id} debt={debt} viewerUserId={auth.user?.id} />
            ))
          )}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Pending settlement requests</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="grid gap-3">
            <h3 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">
              Awaiting my approval
            </h3>
            {pendingForMe.length === 0 ? (
              <EmptyState>No requests to review.</EmptyState>
            ) : (
              pendingForMe.map((request) => (
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
          <div className="grid gap-3">
            <h3 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">
              Requested by me
            </h3>
            {pendingFromMe.length === 0 ? (
              <EmptyState>No outgoing requests.</EmptyState>
            ) : (
              pendingFromMe.map((request) => (
                <SettlementRequestCard key={request.id} request={request} />
              ))
            )}
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Settled debts</h2>
        <div className="mt-4 grid gap-3">
          {(debts?.settledDebts ?? []).length === 0 ? (
            <EmptyState>No settled debts yet.</EmptyState>
          ) : (
            debts?.settledDebts.map((debt) => (
              <DebtCard key={debt.id} debt={debt} viewerUserId={auth.user?.id} />
            ))
          )}
        </div>
      </Card>

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
