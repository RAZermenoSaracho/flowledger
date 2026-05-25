import { SHARED_EXPENSE_STATUSES } from "@flowledger/shared";
import type { SharedExpenseStatus } from "@flowledger/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { SelectField, TextInput } from "../components/FormField";
import { SearchComponent } from "../components/SearchComponent";
import { apiRequest } from "../services/api";
import type { PublicUser, SharedExpense, Transaction } from "../types/api";
import { applyCollectionControls, dateSortValue } from "../utils/search";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

type ParticipantDraft = {
  draftId: string;
  userId?: string | null;
  participantName: string;
  email?: string;
  source: "app" | "manual";
  shareAmount: string;
  paidAmount: string;
};

function participantStatus(shareAmount: string, paidAmount: string) {
  const share = Number(shareAmount);
  const paid = Number(paidAmount);

  if (paid >= share) return "paid";
  if (paid > 0) return "partial";
  return "pending";
}

function splitDirectionLabel(sharedExpense: SharedExpense) {
  if (sharedExpense.transaction?.type === "income")
    return "You owe participants";
  if (sharedExpense.transaction?.type === "expense")
    return "Participants owe you";
  return "No debt direction";
}

export function SharedExpensesPage() {
  const queryClient = useQueryClient();
  const [transactionId, setTransactionId] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<SharedExpenseStatus>("open");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [participants, setParticipants] = useState<ParticipantDraft[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const trimmedUserSearch = userSearch.trim();

  const transactionsQuery = useQuery({
    queryKey: ["transactions", "shared-options"],
    queryFn: async () =>
      (await apiRequest<{ transactions: Transaction[] }>("/transactions"))
        .transactions
  });
  const sharedExpensesQuery = useQuery({
    queryKey: ["shared-expenses"],
    queryFn: async () =>
      (
        await apiRequest<{ sharedExpenses: SharedExpense[] }>(
          "/shared-expenses"
        )
      ).sharedExpenses
  });
  const userSearchQuery = useQuery({
    queryKey: ["users", "search", trimmedUserSearch],
    enabled: trimmedUserSearch.length > 1,
    queryFn: async () =>
      (
        await apiRequest<{ users: PublicUser[] }>("/users/search", {
          query: { q: trimmedUserSearch, limit: "8" }
        })
      ).users
  });
  const selectedTransaction = (transactionsQuery.data ?? []).find(
    (transaction) => transaction.id === transactionId
  );
  const visibleSharedExpenses = useMemo(
    () =>
      applyCollectionControls(sharedExpensesQuery.data ?? [], {
        search,
        searchFields: (sharedExpense) => [
          sharedExpense.title,
          sharedExpense.status,
          splitDirectionLabel(sharedExpense),
          sharedExpense.transaction?.name,
          ...sharedExpense.participants.map(
            (participant) => participant.participantName
          )
        ],
        filters: [
          (sharedExpense) =>
            statusFilter ? sharedExpense.status === statusFilter : true
        ],
        sortBy,
        sortDirection,
        sorters: {
          title: (sharedExpense) => sharedExpense.title,
          totalAmount: (sharedExpense) => sharedExpense.totalAmount,
          status: (sharedExpense) => sharedExpense.status,
          createdAt: (sharedExpense) => dateSortValue(sharedExpense.createdAt),
          updatedAt: (sharedExpense) => dateSortValue(sharedExpense.updatedAt)
        }
      }),
    [search, sharedExpensesQuery.data, sortBy, sortDirection, statusFilter]
  );

  const createSharedExpense = useMutation({
    mutationFn: () =>
      apiRequest("/shared-expenses", {
        method: "POST",
        body: {
          transactionId,
          title,
          status,
          participants: participants.map((participant) => ({
            userId: participant.userId ?? null,
            participantName: participant.participantName,
            shareAmount: Number(participant.shareAmount),
            paidAmount: Number(participant.paidAmount),
            status: participantStatus(
              participant.shareAmount,
              participant.paidAmount
            )
          }))
        }
      }),
    onSuccess: refreshAfterSave
  });
  const updateSharedExpense = useMutation({
    mutationFn: () =>
      apiRequest(`/shared-expenses/${editingId}`, {
        method: "PUT",
        body: {
          transactionId,
          title,
          status,
          participants: participants.map((participant) => ({
            userId: participant.userId ?? null,
            participantName: participant.participantName,
            shareAmount: Number(participant.shareAmount),
            paidAmount: Number(participant.paidAmount),
            status: participantStatus(
              participant.shareAmount,
              participant.paidAmount
            )
          }))
        }
      }),
    onSuccess: refreshAfterSave
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (editingId) {
      await updateSharedExpense.mutateAsync();
      return;
    }

    await createSharedExpense.mutateAsync();
  }

  async function refreshAfterSave() {
    closeForm();
    await queryClient.invalidateQueries({ queryKey: ["shared-expenses"] });
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
  }

  function closeForm() {
    setTransactionId("");
    setTitle("");
    setStatus("open");
    setEditingId(null);
    setParticipantName("");
    setUserSearch("");
    setParticipants([]);
    setIsFormOpen(false);
  }

  function addManualParticipant() {
    const name = participantName.trim();
    if (!name) return;

    setParticipants((current) => [
      ...current,
      {
        draftId: crypto.randomUUID(),
        participantName: name,
        source: "manual",
        shareAmount: "",
        paidAmount: "0"
      }
    ]);
    setParticipantName("");
  }

  function addUserParticipant(user: PublicUser) {
    setParticipants((current) => {
      if (current.some((participant) => participant.userId === user.id)) {
        return current;
      }

      return [
        ...current,
        {
          draftId: crypto.randomUUID(),
          userId: user.id,
          participantName: user.name,
          email: user.email,
          source: "app",
          shareAmount: "",
          paidAmount: "0"
        }
      ];
    });
    setUserSearch("");
  }

  function updateParticipant(
    draftId: string,
    field: "shareAmount" | "paidAmount",
    value: string
  ) {
    setParticipants((current) =>
      current.map((participant) =>
        participant.draftId === draftId
          ? { ...participant, [field]: value }
          : participant
      )
    );
  }

  function removeParticipant(draftId: string) {
    setParticipants((current) =>
      current.filter((participant) => participant.draftId !== draftId)
    );
  }

  function editSharedExpense(sharedExpense: SharedExpense) {
    setTransactionId(sharedExpense.transactionId);
    setTitle(sharedExpense.title);
    setStatus(sharedExpense.status);
    setEditingId(sharedExpense.id);
    setParticipantName("");
    setUserSearch("");
    setParticipants(
      sharedExpense.participants.map((participant) => ({
        draftId: participant.id,
        userId: participant.userId,
        participantName: participant.participantName,
        source: participant.userId ? "app" : "manual",
        shareAmount: String(participant.shareAmount),
        paidAmount: String(participant.paidAmount)
      }))
    );
    setIsFormOpen(true);
  }

  const isSaving =
    createSharedExpense.isPending || updateSharedExpense.isPending;

  return (
    <div className="grid gap-6">
      <Card>
        {isFormOpen ? (
          <>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <h2 className="text-lg font-semibold">
                {editingId ? "Edit shared expense" : "New shared expense"}
              </h2>
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={closeForm}
              >
                Cancel
              </Button>
            </div>
            <form
              className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3"
              onSubmit={submit}
            >
              <SelectField
                label="Transaction"
                value={transactionId}
                onChange={(event) => setTransactionId(event.target.value)}
                required
              >
                <option value="">Select transaction</option>
                {(transactionsQuery.data ?? []).map((transaction) => (
                  <option key={transaction.id} value={transaction.id}>
                    {transaction.name} · {transaction.type} ·{" "}
                    {money.format(transaction.amount)}
                  </option>
                ))}
              </SelectField>
              <TextInput
                label="Title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
              <div className="grid gap-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Transaction amount
                </span>
                <p className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-200">
                  {selectedTransaction
                    ? money.format(selectedTransaction.amount)
                    : "Select transaction"}
                </p>
              </div>
              <SelectField
                label="Status"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as SharedExpenseStatus)
                }
              >
                {SHARED_EXPENSE_STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </SelectField>
              <TextInput
                label="Find app user"
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="Search by name or email"
              />
              <div className="grid gap-2 md:col-span-2">
                {trimmedUserSearch.length > 1 ? (
                  userSearchQuery.isFetching ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Searching app users...
                    </p>
                  ) : (userSearchQuery.data ?? []).length > 0 ? (
                    (userSearchQuery.data ?? []).map((user) => (
                      <div
                        key={user.id}
                        className="flex flex-col justify-between gap-2 rounded-md border border-slate-200 p-2 text-sm dark:border-slate-800 sm:flex-row sm:items-center"
                      >
                        <div>
                          <p className="font-medium">{user.name}</p>
                          <p className="text-slate-500 dark:text-slate-400">
                            {user.email}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full sm:w-auto"
                          onClick={() => addUserParticipant(user)}
                        >
                          Add app user
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      No app users found.
                    </p>
                  )
                ) : null}
              </div>
              <div className="flex flex-col gap-2 md:col-span-2 xl:col-span-3 sm:flex-row sm:items-end">
                <TextInput
                  label="Manual participant"
                  value={participantName}
                  onChange={(event) => setParticipantName(event.target.value)}
                  className="sm:min-w-80"
                  placeholder="Name for someone without an account"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={addManualParticipant}
                >
                  Add manual participant
                </Button>
              </div>
              <div className="grid gap-3 md:col-span-2 xl:col-span-3">
                {participants.map((participant) => (
                  <div
                    key={participant.draftId}
                    className="grid gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-800 md:grid-cols-2 xl:grid-cols-4"
                  >
                    <div className="text-sm">
                      <p className="font-semibold">
                        {participant.participantName}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400">
                        {participant.source === "app"
                          ? `App user${participant.email ? ` · ${participant.email}` : ""}`
                          : "Manual participant"}
                      </p>
                    </div>
                    <TextInput
                      label="Share amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={participant.shareAmount}
                      onChange={(event) =>
                        updateParticipant(
                          participant.draftId,
                          "shareAmount",
                          event.target.value
                        )
                      }
                      required
                    />
                    <TextInput
                      label="Settled amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={participant.paidAmount}
                      onChange={(event) =>
                        updateParticipant(
                          participant.draftId,
                          "paidAmount",
                          event.target.value
                        )
                      }
                    />
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="danger"
                        className="w-full"
                        onClick={() => removeParticipant(participant.draftId)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
                {participants.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Add an app user or a manual participant to save the split.
                  </p>
                ) : null}
              </div>
              <div className="md:col-span-2 xl:col-span-3">
                <Button
                  type="submit"
                  disabled={isSaving || participants.length === 0}
                >
                  Save split
                </Button>
              </div>
            </form>
          </>
        ) : (
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => setIsFormOpen(true)}
          >
            Add shared expense
          </Button>
        )}
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Shared expenses</h2>
        <div className="mt-4">
          <SearchComponent
            searchValue={search}
            searchPlaceholder="Search shared expenses"
            onSearchChange={setSearch}
            filters={[
              {
                id: "status",
                label: "Status",
                value: statusFilter,
                onChange: setStatusFilter,
                options: [
                  { label: "All statuses", value: "" },
                  ...SHARED_EXPENSE_STATUSES.map((item) => ({
                    label: item,
                    value: item
                  }))
                ]
              }
            ]}
            sort={{
              value: sortBy,
              direction: sortDirection,
              onChange: setSortBy,
              onDirectionChange: setSortDirection,
              options: [
                { label: "Created date", value: "createdAt" },
                { label: "Updated date", value: "updatedAt" },
                { label: "Title", value: "title" },
                { label: "Total amount", value: "totalAmount" },
                { label: "Status", value: "status" }
              ]
            }}
          />
        </div>
        <div className="mt-4 grid gap-3">
          {visibleSharedExpenses.map((sharedExpense) => (
            <div
              key={sharedExpense.id}
              className="rounded-md border border-slate-200 p-3 dark:border-slate-800"
            >
              <div className="flex flex-col justify-between gap-2 sm:flex-row">
                <div>
                  <p className="font-semibold">{sharedExpense.title}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {sharedExpense.status} ·{" "}
                    {splitDirectionLabel(sharedExpense)}
                  </p>
                </div>
                <p className="font-semibold">
                  {money.format(sharedExpense.totalAmount)}
                </p>
              </div>
              <div className="mt-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={() => editSharedExpense(sharedExpense)}
                >
                  Edit
                </Button>
              </div>
              <div className="mt-3 grid gap-2">
                {sharedExpense.participants.map((participant) => (
                  <div
                    key={participant.id}
                    className="rounded-md bg-slate-50 p-2 text-sm dark:bg-slate-950"
                  >
                    <span className="font-medium">
                      {participant.userId ? "App user" : "Manual"}
                    </span>{" "}
                    · {participant.participantName}:{" "}
                    {money.format(participant.paidAmount)} settled of{" "}
                    {money.format(participant.shareAmount)}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {visibleSharedExpenses.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No shared expenses found.
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
