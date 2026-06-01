import { TRANSACTION_TYPES } from "@flowledger/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { SelectField, TextArea, TextInput } from "../components/FormField";
import { SearchComponent } from "../components/SearchComponent";
import { apiRequest } from "../services/api";
import { useAuth } from "../hooks/useAuth";
import { applyCollectionControls, dateSortValue } from "../utils/search";
import {
  parseTransactionAmount,
  summarizeTransactions
} from "../utils/transactions";
import type {
  Account,
  Category,
  Group,
  PublicUser,
  Transaction
} from "../types/api";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

type TransactionForm = {
  id?: string;
  name: string;
  amount: string;
  type: "income" | "expense" | "transfer";
  date: string;
  accountId: string;
  categoryId: string;
  groupId: string;
  notes: string;
  isShared: boolean;
  sharedTitle: string;
};

type ParticipantDraft = {
  draftId: string;
  userId?: string | null;
  participantName: string;
  email?: string;
  source: "app" | "manual";
  shareAmount: string;
};

const emptyForm: TransactionForm = {
  name: "",
  amount: "",
  type: "expense",
  date: new Date().toISOString().slice(0, 10),
  accountId: "",
  categoryId: "",
  groupId: "",
  notes: "",
  isShared: false,
  sharedTitle: ""
};

const emptyFilters = {
  search: "",
  type: "",
  accountId: "",
  categoryId: "",
  groupId: "",
  transactionFilterType: "",
  dateFrom: "",
  dateTo: "",
  amountFrom: "",
  amountTo: "",
  classification: ""
};

function needsClassification(transaction: Transaction) {
  return !transaction.accountId || !transaction.categoryId;
}

export function TransactionsPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TransactionForm>(emptyForm);
  const [filters, setFilters] = useState(emptyFilters);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [areAdvancedFiltersOpen, setAreAdvancedFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [areSharedFieldsOpen, setAreSharedFieldsOpen] = useState(true);
  const [participantName, setParticipantName] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [participants, setParticipants] = useState<ParticipantDraft[]>([]);
  const trimmedUserSearch = userSearch.trim();

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
  const transactionsQuery = useQuery({
    queryKey: ["transactions", filters],
    queryFn: async () =>
      (
        await apiRequest<{ transactions: Transaction[] }>("/transactions", {
          query: filters
        })
      ).transactions
  });
  const userSearchQuery = useQuery({
    queryKey: ["users", "search", trimmedUserSearch],
    enabled:
      isFormOpen && form.isShared && !form.id && trimmedUserSearch.length > 1,
    queryFn: async () =>
      (
        await apiRequest<{ users: PublicUser[] }>("/users/search", {
          query: { q: trimmedUserSearch, limit: "8" }
        })
      ).users
  });

  const transactionAmount = Number(form.amount);
  const selectedGroup = (groupsQuery.data ?? []).find(
    (group) => group.id === form.groupId
  );
  const visibleTransactions = useMemo(() => {
    return applyCollectionControls(transactionsQuery.data ?? [], {
      sortBy,
      sortDirection,
      sorters: {
        date: (transaction) => dateSortValue(transaction.date),
        createdAt: (transaction) => dateSortValue(transaction.createdAt),
        name: (transaction) => transaction.name,
        amount: (transaction) => parseTransactionAmount(transaction.amount)
      }
    });
  }, [sortBy, sortDirection, transactionsQuery.data]);
  const transactionSummary = useMemo(
    () => summarizeTransactions(visibleTransactions),
    [visibleTransactions]
  );
  const transactionBalance =
    transactionSummary.income - transactionSummary.expenses;
  const hasActiveFilters = Object.values(filters).some(Boolean);
  const selectedGroupCategories = selectedGroup?.categories ?? [];
  const categoryOptions = form.groupId
    ? selectedGroupCategories
    : (categoriesQuery.data ?? []);
  const selectedCategoryId = form.categoryId;
  const participantShareTotal = participants.reduce(
    (sum, participant) => sum + Number(participant.shareAmount || 0),
    0
  );
  const remainingSharedAmount = Number.isFinite(transactionAmount)
    ? transactionAmount - participantShareTotal
    : 0;

  const saveTransaction = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        amount: Number(form.amount),
        type: form.type,
        date: form.date,
        accountId: form.accountId || null,
        categoryId: form.categoryId || null,
        groupId: form.groupId || null,
        notes: form.notes || null,
        ...(!form.id && form.isShared
          ? {
              sharedExpense: {
                title: form.sharedTitle || form.name,
                participants: participants.map((participant) => ({
                  userId: participant.userId ?? null,
                  participantName: participant.participantName,
                  shareAmount: Number(participant.shareAmount),
                  paidAmount: 0,
                  status: "pending"
                }))
              }
            }
          : {})
      };
      return form.id
        ? apiRequest(`/transactions/${form.id}`, { method: "PUT", body })
        : apiRequest("/transactions", { method: "POST", body });
    },
    onSuccess: async () => {
      setForm(emptyForm);
      setIsFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: ["summary"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
    }
  });

  const deleteTransaction = useMutation({
    mutationFn: (transactionId: string) =>
      apiRequest(`/transactions/${transactionId}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: ["summary"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      await queryClient.invalidateQueries({ queryKey: ["shared-expenses"] });
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    await saveTransaction.mutateAsync();
  }

  async function confirmDeleteTransaction(transaction: Transaction) {
    const confirmed = window.confirm(
      `Delete "${transaction.name}" permanently? This will also remove any attached shared expense, participants, debts, settlements, and related notifications.`
    );
    if (!confirmed) return;

    await deleteTransaction.mutateAsync(transaction.id);
  }

  function closeForm() {
    setForm(emptyForm);
    setParticipantName("");
    setUserSearch("");
    setParticipants([]);
    setAreSharedFieldsOpen(true);
    setIsFormOpen(false);
  }

  function suggestEqualGroupSplit(group: Group, amountValue = form.amount) {
    const amount = Number(amountValue);
    const members = group.members;
    const participantMembers = members.filter(
      (member) => member.userId !== auth.user?.id
    );

    if (!Number.isFinite(amount) || amount <= 0 || members.length < 2) {
      setParticipants([]);
      return;
    }

    const equalShare = (
      Math.round((amount / members.length) * 100) / 100
    ).toFixed(2);
    setParticipants(
      participantMembers.map((member) => ({
        draftId: member.id,
        userId: member.userId,
        participantName: member.user.name,
        email: member.user.email,
        source: "app",
        shareAmount: equalShare
      }))
    );
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
        shareAmount: ""
      }
    ]);
    setParticipantName("");
  }

  function addUserParticipant(user: PublicUser) {
    if (
      selectedGroup &&
      !selectedGroup.members.some((member) => member.userId === user.id)
    ) {
      return;
    }

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
          shareAmount: ""
        }
      ];
    });
    setUserSearch("");
  }

  function updateParticipantShare(draftId: string, value: string) {
    setParticipants((current) =>
      current.map((participant) =>
        participant.draftId === draftId
          ? { ...participant, shareAmount: value }
          : participant
      )
    );
  }

  function removeParticipant(draftId: string) {
    setParticipants((current) =>
      current.filter((participant) => participant.draftId !== draftId)
    );
  }

  return (
    <div className="grid gap-6">
      <Card>
        {isFormOpen ? (
          <>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <h2 className="text-lg font-semibold">
                {form.id ? "Edit transaction" : "New transaction"}
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
              <TextInput
                label="Name"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                required
              />
              <TextInput
                label="Amount"
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(event) =>
                  setForm({ ...form, amount: event.target.value })
                }
                required
              />
              <SelectField
                label="Type"
                value={form.type}
                onChange={(event) => {
                  setForm({
                    ...form,
                    type: event.target.value as typeof form.type
                  });
                }}
              >
                {TRANSACTION_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </SelectField>
              <TextInput
                label="Date"
                type="date"
                value={form.date}
                onChange={(event) =>
                  setForm({ ...form, date: event.target.value })
                }
                required
              />
              <SelectField
                label="Account"
                value={form.accountId}
                onChange={(event) =>
                  setForm({ ...form, accountId: event.target.value })
                }
              >
                <option value="">None</option>
                {(accountsQuery.data ?? []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Category"
                value={selectedCategoryId}
                onChange={(event) => {
                  setForm({
                    ...form,
                    categoryId: event.target.value
                  });
                }}
              >
                <option value="">None</option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Group"
                value={form.groupId}
                onChange={(event) => {
                  const groupId = event.target.value;
                  const group = (groupsQuery.data ?? []).find(
                    (item) => item.id === groupId
                  );
                  setForm({
                    ...form,
                    groupId,
                    categoryId: groupId ? "" : form.categoryId,
                    isShared: groupId
                      ? form.isShared || !form.id
                      : form.isShared
                  });
                  if (group && !form.id) {
                    suggestEqualGroupSplit(group);
                  }
                }}
              >
                <option value="">None</option>
                {(groupsQuery.data ?? []).map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </SelectField>
              <div className="md:col-span-2 xl:col-span-3">
                <TextArea
                  label="Notes"
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                />
              </div>
              {!form.id ? (
                <div className="grid gap-3 rounded-md border border-slate-200 p-3 md:col-span-2 xl:col-span-3 dark:border-slate-800">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-pine"
                        checked={form.isShared}
                        onChange={(event) => {
                          setForm({ ...form, isShared: event.target.checked });
                          if (!event.target.checked) {
                            setParticipantName("");
                            setUserSearch("");
                            setParticipants([]);
                          }
                        }}
                      />
                      Shared expense
                    </label>
                    {form.isShared ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full sm:w-auto"
                        aria-expanded={areSharedFieldsOpen}
                        onClick={() =>
                          setAreSharedFieldsOpen((value) => !value)
                        }
                      >
                        Participants{" "}
                        <span aria-hidden="true">
                          {areSharedFieldsOpen ? "^" : "v"}
                        </span>
                      </Button>
                    ) : null}
                  </div>
                  {form.isShared && areSharedFieldsOpen ? (
                    <div className="grid gap-3">
                      <TextInput
                        label="Split title"
                        value={form.sharedTitle}
                        onChange={(event) =>
                          setForm({ ...form, sharedTitle: event.target.value })
                        }
                        placeholder={form.name || "Shared transaction"}
                      />
                      {selectedGroup ? (
                        <div className="flex flex-col justify-between gap-2 rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-950 sm:flex-row sm:items-center">
                          <p className="text-slate-600 dark:text-slate-300">
                            Suggested split from {selectedGroup.name}: equal
                            share across {selectedGroup.members.length} members.
                          </p>
                          <Button
                            type="button"
                            variant="secondary"
                            className="w-full sm:w-auto"
                            onClick={() =>
                              suggestEqualGroupSplit(selectedGroup)
                            }
                          >
                            Reset split
                          </Button>
                        </div>
                      ) : null}
                      <div className="grid gap-3 md:grid-cols-2">
                        <TextInput
                          label="Find app user"
                          value={userSearch}
                          onChange={(event) =>
                            setUserSearch(event.target.value)
                          }
                          placeholder="Search by name or email"
                        />
                        {!selectedGroup ? (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                            <TextInput
                              label="Manual participant"
                              value={participantName}
                              onChange={(event) =>
                                setParticipantName(event.target.value)
                              }
                              className="sm:min-w-60"
                              placeholder="Name"
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              className="w-full sm:w-auto"
                              onClick={addManualParticipant}
                            >
                              Add
                            </Button>
                          </div>
                        ) : null}
                      </div>
                      {trimmedUserSearch.length > 1 ? (
                        <div className="grid gap-2">
                          {userSearchQuery.isFetching ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              Searching app users...
                            </p>
                          ) : (userSearchQuery.data ?? []).filter(
                              (user) =>
                                !selectedGroup ||
                                selectedGroup.members.some(
                                  (member) => member.userId === user.id
                                )
                            ).length > 0 ? (
                            (userSearchQuery.data ?? [])
                              .filter(
                                (user) =>
                                  !selectedGroup ||
                                  selectedGroup.members.some(
                                    (member) => member.userId === user.id
                                  )
                              )
                              .map((user) => (
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
                              No eligible app users found.
                            </p>
                          )}
                        </div>
                      ) : null}
                      <div className="grid gap-2">
                        {participants.map((participant) => (
                          <div
                            key={participant.draftId}
                            className="grid gap-3 rounded-md bg-slate-50 p-3 dark:bg-slate-950 sm:grid-cols-[1fr_minmax(8rem,12rem)_auto] sm:items-end"
                          >
                            <div className="text-sm">
                              <p className="font-semibold">
                                {participant.participantName}
                              </p>
                              <p className="text-slate-500 dark:text-slate-400">
                                {participant.source === "app"
                                  ? `App user${
                                      participant.email
                                        ? ` · ${participant.email}`
                                        : ""
                                    }`
                                  : "Manual participant"}
                              </p>
                            </div>
                            <TextInput
                              label="Share"
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={participant.shareAmount}
                              onChange={(event) =>
                                updateParticipantShare(
                                  participant.draftId,
                                  event.target.value
                                )
                              }
                              required
                            />
                            <Button
                              type="button"
                              variant="danger"
                              className="w-full sm:w-auto"
                              onClick={() =>
                                removeParticipant(participant.draftId)
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        ))}
                        {participants.length > 0 ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Assigned {money.format(participantShareTotal)} of{" "}
                            {Number.isFinite(transactionAmount)
                              ? money.format(transactionAmount)
                              : "$0.00"}
                            . Remaining owner share:{" "}
                            {money.format(Math.max(0, remainingSharedAmount))}.
                          </p>
                        ) : (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Add an app user or manual participant to create a
                            split.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="md:col-span-2 xl:col-span-3">
                <Button
                  type="submit"
                  disabled={
                    saveTransaction.isPending ||
                    (form.isShared &&
                      (participants.length === 0 || remainingSharedAmount < 0))
                  }
                >
                  Save transaction
                </Button>
              </div>
            </form>
          </>
        ) : (
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => {
              setForm(emptyForm);
              setParticipantName("");
              setUserSearch("");
              setParticipants([]);
              setAreSharedFieldsOpen(true);
              setIsFormOpen(true);
            }}
          >
            Add transaction
          </Button>
        )}
      </Card>
      <div className="grid gap-4">
        <Card>
          <SearchComponent
            searchValue={filters.search}
            searchPlaceholder="Search transactions"
            onSearchChange={(value) =>
              setFilters({ ...filters, search: value })
            }
            sort={{
              value: sortBy,
              direction: sortDirection,
              onChange: setSortBy,
              onDirectionChange: setSortDirection,
              options: [
                { label: "Date", value: "date" },
                { label: "Name", value: "name" },
                { label: "Amount", value: "amount" },
                { label: "Created date", value: "createdAt" }
              ]
            }}
          >
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              aria-expanded={areAdvancedFiltersOpen}
              onClick={() => setAreAdvancedFiltersOpen((value) => !value)}
            >
              Filters{" "}
              <span aria-hidden="true">
                {areAdvancedFiltersOpen ? "^" : "v"}
              </span>
            </Button>
            {areAdvancedFiltersOpen ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <TextInput
                  label="From"
                  type="date"
                  value={filters.dateFrom}
                  onChange={(event) =>
                    setFilters({ ...filters, dateFrom: event.target.value })
                  }
                />
                <TextInput
                  label="To"
                  type="date"
                  value={filters.dateTo}
                  onChange={(event) =>
                    setFilters({ ...filters, dateTo: event.target.value })
                  }
                />
                <TextInput
                  label="Minimum amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={filters.amountFrom}
                  onChange={(event) =>
                    setFilters({ ...filters, amountFrom: event.target.value })
                  }
                />
                <TextInput
                  label="Maximum amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={filters.amountTo}
                  onChange={(event) =>
                    setFilters({ ...filters, amountTo: event.target.value })
                  }
                />
                <SelectField
                  label="Category"
                  value={filters.categoryId}
                  onChange={(event) =>
                    setFilters({ ...filters, categoryId: event.target.value })
                  }
                >
                  <option value="">All</option>
                  {(categoriesQuery.data ?? []).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Group"
                  value={filters.groupId}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      groupId: event.target.value,
                      categoryId: ""
                    })
                  }
                >
                  <option value="">All</option>
                  {(groupsQuery.data ?? []).map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Group category"
                  value={filters.categoryId}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      categoryId: event.target.value
                    })
                  }
                  disabled={!filters.groupId}
                >
                  <option value="">All</option>
                  {(
                    (groupsQuery.data ?? []).find(
                      (group) => group.id === filters.groupId
                    )?.categories ?? []
                  ).map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Account"
                  value={filters.accountId}
                  onChange={(event) =>
                    setFilters({ ...filters, accountId: event.target.value })
                  }
                >
                  <option value="">All</option>
                  {(accountsQuery.data ?? []).map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Type"
                  value={filters.type}
                  onChange={(event) =>
                    setFilters({ ...filters, type: event.target.value })
                  }
                >
                  <option value="">All</option>
                  {TRANSACTION_TYPES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Transaction group"
                  value={filters.transactionFilterType}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      transactionFilterType: event.target.value
                    })
                  }
                >
                  <option value="">All transactions</option>
                  <option value="normal">Normal transactions</option>
                  <option value="settlement">Settlement transactions</option>
                  <option value="expenseOffset">
                    Expense reimbursement/offset transactions
                  </option>
                </SelectField>
                <SelectField
                  label="Classification"
                  value={filters.classification}
                  onChange={(event) =>
                    setFilters({
                      ...filters,
                      classification: event.target.value
                    })
                  }
                >
                  <option value="">All</option>
                  <option value="complete">Complete</option>
                  <option value="needsClassification">
                    Needs classification
                  </option>
                </SelectField>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => setFilters(emptyFilters)}
                  >
                    Clear filters
                  </Button>
                </div>
              </div>
            ) : null}
          </SearchComponent>
        </Card>
        <div className="grid gap-3 md:grid-cols-3">
          <Card>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Total income
            </p>
            <p className="mt-2 text-2xl font-bold text-pine dark:text-emerald-300">
              {money.format(transactionSummary.income)}
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {hasActiveFilters
                ? "Filtered transactions"
                : "Visible transactions"}
            </p>
          </Card>
          <Card>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Total expenses
            </p>
            <p className="mt-2 text-2xl font-bold text-coral dark:text-orange-300">
              {money.format(transactionSummary.expenses)}
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {hasActiveFilters
                ? "Filtered transactions"
                : "Visible transactions"}
            </p>
          </Card>
          <Card>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Balance
            </p>
            <p
              className={`mt-2 text-2xl font-bold ${
                transactionBalance >= 0
                  ? "text-pine dark:text-emerald-300"
                  : "text-coral dark:text-orange-300"
              }`}
            >
              {money.format(transactionBalance)}
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {visibleTransactions.length} transaction
              {visibleTransactions.length === 1 ? "" : "s"}
            </p>
          </Card>
        </div>
        <Card>
          <h2 className="text-lg font-semibold">Transactions</h2>
          <div className="mt-4 grid gap-3">
            {visibleTransactions.map((transaction) => {
              const isPendingClassification = needsClassification(transaction);
              return (
                <div
                  key={transaction.id}
                  className={`grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_auto_auto] md:items-center ${
                    isPendingClassification
                      ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
                      : "border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <div>
                    <Link
                      className="font-semibold text-pine dark:text-emerald-300"
                      to={`/transactions/${transaction.id}`}
                    >
                      {transaction.name}
                    </Link>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {new Date(transaction.date).toLocaleDateString()} ·{" "}
                      {transaction.category?.name ?? "Uncategorized"} ·{" "}
                      {transaction.account?.name ?? "No account"}
                      {transaction.group
                        ? ` · ${transaction.group.name}${
                            transaction.category
                              ? ` / ${transaction.category.name}`
                              : ""
                          }`
                        : ""}
                    </p>
                    {isPendingClassification ? (
                      <p className="mt-1 text-sm font-semibold text-amber-800 dark:text-amber-200">
                        Pending classification: add a category and account.
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={
                      transaction.type === "income"
                        ? "font-semibold text-pine dark:text-emerald-300"
                        : "font-semibold text-coral dark:text-orange-300"
                    }
                  >
                    {money.format(parseTransactionAmount(transaction.amount))}
                  </span>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setForm({
                          id: transaction.id,
                          name: transaction.name,
                          amount: String(transaction.amount),
                          type: transaction.type,
                          date: transaction.date.slice(0, 10),
                          accountId: transaction.accountId ?? "",
                          categoryId: transaction.categoryId ?? "",
                          groupId: transaction.groupId ?? "",
                          notes: transaction.notes ?? "",
                          isShared: false,
                          sharedTitle: ""
                        });
                        setParticipantName("");
                        setUserSearch("");
                        setParticipants([]);
                        setIsFormOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={deleteTransaction.isPending}
                      onClick={() => void confirmDeleteTransaction(transaction)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
            {visibleTransactions.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No transactions found.
              </p>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
