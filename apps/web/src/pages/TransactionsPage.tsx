import { TRANSACTION_TYPES } from "@flowledger/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { CurrencySelect } from "../components/CurrencySelect";
import { SelectField, TextArea, TextInput } from "../components/FormField";
import {
  ImportedTransactionCard,
  providerAccountLabel
} from "../components/ImportedTransactionCard";
import { ImportedTransactionSelectionToolbar } from "../components/ImportedTransactionSelectionToolbar";
import { SearchComponent } from "../components/SearchComponent";
import { ApiError, apiRequest } from "../services/api";
import { useAuth } from "../hooks/useAuth";
import { formatMoney } from "../utils/currency";
import { applyCollectionControls, dateSortValue } from "../utils/search";
import {
  parseTransactionAmount,
  summarizeTransactions
} from "../utils/transactions";
import type {
  Account,
  Category,
  Group,
  ProviderImportedTransaction,
  PublicUser,
  Transaction
} from "../types/api";

const TRANSFER_ACCOUNT_VALIDATION_MESSAGE =
  "Source and destination accounts must be different";

type TransactionForm = {
  id?: string;
  name: string;
  amount: string;
  executionCurrency: string;
  type: "income" | "expense" | "transfer";
  date: string;
  accountId: string;
  transferToAccountId: string;
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
  executionCurrency: "USD",
  type: "expense",
  date: new Date().toISOString().slice(0, 10),
  accountId: "",
  transferToAccountId: "",
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

const emptyImportedFilters = {
  status: "pending",
  search: "",
  provider: "",
  accountId: "",
  providerAccountId: "",
  categoryId: "",
  dateFrom: "",
  dateTo: "",
  amountFrom: "",
  amountTo: ""
};

type TransactionsTab = "transactions" | "imported";
type ImportedFilters = typeof emptyImportedFilters;

function batchErrors(error: unknown) {
  if (!(error instanceof ApiError)) return [];
  const body = error.body as { errors?: { id: string; message: string }[] };
  return Array.isArray(body?.errors) ? body.errors : [];
}

function compactImportedFilters(
  filters: ImportedFilters & { sortBy: string; sortDirection: "asc" | "desc" }
) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== "")
  ) as Record<string, string>;
}

function needsClassification(transaction: Transaction) {
  if (transaction.type === "transfer") {
    return !transaction.accountId || !transaction.transferToAccountId;
  }

  return !transaction.accountId || !transaction.categoryId;
}

function transactionAccountLabel(transaction: Transaction) {
  if (transaction.type === "transfer") {
    return `${transaction.account?.name ?? "No from account"} -> ${
      transaction.transferToAccount?.name ?? "No to account"
    }`;
  }

  return transaction.account?.name ?? "No account";
}

export function TransactionsPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState<TransactionForm>(emptyForm);
  const [filters, setFilters] = useState(emptyFilters);
  const [activeTab, setActiveTab] = useState<TransactionsTab>(
    searchParams.get("tab") === "imported" ? "imported" : "transactions"
  );
  const [importedFilters, setImportedFilters] = useState<ImportedFilters>({
    ...emptyImportedFilters,
    status:
      searchParams.get("status") === "processed" ||
      searchParams.get("status") === "ignored" ||
      searchParams.get("status") === "pending"
        ? searchParams.get("status")!
        : emptyImportedFilters.status
  });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [areAdvancedFiltersOpen, setAreAdvancedFiltersOpen] = useState(false);
  const [areImportedAdvancedFiltersOpen, setAreImportedAdvancedFiltersOpen] =
    useState(false);
  const [sortBy, setSortBy] = useState("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [importedSortBy, setImportedSortBy] = useState("transactionDate");
  const [importedSortDirection, setImportedSortDirection] = useState<
    "asc" | "desc"
  >("desc");
  const [selectedImportedIds, setSelectedImportedIds] = useState<string[]>([]);
  const [selectAllFilteredImported, setSelectAllFilteredImported] =
    useState(false);
  const [batchCategoryId, setBatchCategoryId] = useState("");
  const [areSharedFieldsOpen, setAreSharedFieldsOpen] = useState(true);
  const [participantName, setParticipantName] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [participants, setParticipants] = useState<ParticipantDraft[]>([]);
  const trimmedUserSearch = userSearch.trim();
  const canShareTransaction = form.type === "income" || form.type === "expense";

  useEffect(() => {
    const tab = searchParams.get("tab");
    const status = searchParams.get("status");

    if (tab === "imported") setActiveTab("imported");
    if (
      status === "pending" ||
      status === "processed" ||
      status === "ignored"
    ) {
      setImportedFilters((current) => ({ ...current, status }));
    }
  }, [searchParams]);

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
  const importedQueryFilters = {
    ...importedFilters,
    sortBy: importedSortBy,
    sortDirection: importedSortDirection
  };
  const importedTransactionsQuery = useQuery({
    queryKey: ["transactions", "imported", importedQueryFilters],
    queryFn: async () =>
      await apiRequest<{
        importedTransactions: ProviderImportedTransaction[];
        total: number;
        pendingCount: number;
      }>("/transactions/imported", {
        query: importedQueryFilters
      })
  });
  const userSearchQuery = useQuery({
    queryKey: ["users", "search", trimmedUserSearch],
    enabled:
      isFormOpen &&
      canShareTransaction &&
      form.isShared &&
      !form.id &&
      trimmedUserSearch.length > 1,
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
  const importedTransactions =
    importedTransactionsQuery.data?.importedTransactions ?? [];
  const pendingImportedCount =
    importedTransactionsQuery.data?.pendingCount ?? 0;
  const importedAccountOptions = useMemo(() => {
    const seen = new Set<string>();

    return importedTransactions.flatMap((transaction) => {
      const id = transaction.providerAccount?.id ?? transaction.providerAccountId;
      if (!id || seen.has(id)) return [];

      seen.add(id);
      return [
        {
          id,
          label: [
            providerAccountLabel(transaction) || transaction.providerAccountId,
            transaction.providerAccount?.account?.name
              ? `Linked to ${transaction.providerAccount.account.name}`
              : null
          ]
            .filter(Boolean)
            .join(" · ")
        }
      ];
    });
  }, [importedTransactions]);
  const selectedVisibleImportedCount = importedTransactions.filter(
    (transaction) => selectedImportedIds.includes(transaction.id)
  ).length;
  const importedSelection = selectAllFilteredImported
    ? {
        mode: "filtered" as const,
        filters: compactImportedFilters(importedQueryFilters)
      }
    : { mode: "ids" as const, ids: selectedImportedIds };
  const transactionSummary = useMemo(
    () => summarizeTransactions(visibleTransactions),
    [visibleTransactions]
  );
  const transactionBalance =
    transactionSummary.income - transactionSummary.expenses;
  const summaryCurrency = auth.user?.preferredCurrency || "USD";
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
  const shouldSaveSharedTransaction =
    !form.id && canShareTransaction && form.isShared;
  const transferAccountsInvalid =
    form.type === "transfer" &&
    Boolean(
      !form.accountId ||
      !form.transferToAccountId ||
      form.accountId === form.transferToAccountId
    );
  const transferAccountsMatch =
    form.type === "transfer" &&
    Boolean(
      form.accountId &&
      form.transferToAccountId &&
      form.accountId === form.transferToAccountId
    );
  const sourceAccountOptions = (accountsQuery.data ?? []).filter(
    (account) => account.id !== form.transferToAccountId
  );
  const destinationAccountOptions = (accountsQuery.data ?? []).filter(
    (account) => account.id !== form.accountId
  );

  const saveTransaction = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        amount: Number(form.amount),
        executionCurrency: form.executionCurrency,
        type: form.type,
        date: form.date,
        accountId: form.accountId || null,
        transferToAccountId:
          form.type === "transfer" ? form.transferToAccountId || null : null,
        categoryId: form.type === "transfer" ? null : form.categoryId || null,
        groupId: form.type === "transfer" ? null : form.groupId || null,
        notes: form.notes || null,
        ...(shouldSaveSharedTransaction
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
      setForm({
        ...emptyForm,
        executionCurrency: auth.user?.preferredCurrency || "USD"
      });
      setIsFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
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
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: ["summary"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      await queryClient.invalidateQueries({ queryKey: ["shared-expenses"] });
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  async function invalidateImportedWorkflow() {
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    await queryClient.invalidateQueries({ queryKey: ["summary"] });
    await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    await queryClient.invalidateQueries({
      queryKey: ["notifications", "unread-count"]
    });
    await queryClient.invalidateQueries({
      queryKey: ["provider-imported-transactions", "pending-count"]
    });
  }

  const updateImportedCategory = useMutation({
    mutationFn: (input: { id: string; categoryId: string | null }) =>
      apiRequest(`/transactions/imported/${input.id}`, {
        method: "PATCH",
        body: { categoryId: input.categoryId }
      }),
    onSuccess: invalidateImportedWorkflow
  });

  const importImportedTransaction = useMutation({
    mutationFn: (input: { id: string; categoryId: string }) =>
      apiRequest(`/transactions/imported/${input.id}/import`, {
        method: "POST",
        body: { categoryId: input.categoryId }
      }),
    onSuccess: async () => {
      setSelectedImportedIds([]);
      setSelectAllFilteredImported(false);
      await invalidateImportedWorkflow();
    }
  });

  const ignoreImportedTransaction = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/transactions/imported/${id}/ignore`, { method: "POST" }),
    onSuccess: async () => {
      setSelectedImportedIds([]);
      setSelectAllFilteredImported(false);
      await invalidateImportedWorkflow();
    }
  });

  const batchImportImportedTransactions = useMutation({
    mutationFn: () =>
      apiRequest("/transactions/imported/batch-import", {
        method: "POST",
        body: {
          selection: importedSelection,
          ...(batchCategoryId ? { categoryId: batchCategoryId } : {})
        }
      }),
    onSuccess: async () => {
      setSelectedImportedIds([]);
      setSelectAllFilteredImported(false);
      setBatchCategoryId("");
      await invalidateImportedWorkflow();
    }
  });

  const batchIgnoreImportedTransactions = useMutation({
    mutationFn: () =>
      apiRequest("/transactions/imported/batch-ignore", {
        method: "POST",
        body: { selection: importedSelection }
      }),
    onSuccess: async () => {
      setSelectedImportedIds([]);
      setSelectAllFilteredImported(false);
      await invalidateImportedWorkflow();
    }
  });

  const unignoreImportedTransaction = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/transactions/imported/${id}/unignore`, { method: "POST" }),
    onSuccess: async () => {
      setSelectedImportedIds([]);
      setSelectAllFilteredImported(false);
      await invalidateImportedWorkflow();
    }
  });

  const batchUnignoreImportedTransactions = useMutation({
    mutationFn: () =>
      apiRequest("/transactions/imported/batch-unignore", {
        method: "POST",
        body: { selection: importedSelection }
      }),
    onSuccess: async () => {
      setSelectedImportedIds([]);
      setSelectAllFilteredImported(false);
      await invalidateImportedWorkflow();
    }
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (transferAccountsInvalid) return;

    await saveTransaction.mutateAsync();
  }

  async function confirmDeleteTransaction(transaction: Transaction) {
    const confirmed = window.confirm(
      `Delete "${transaction.name}" permanently? This will also remove any attached shared transaction, participants, debts, settlements, and related notifications.`
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

  function clearSharedTransactionDrafts() {
    setParticipantName("");
    setUserSearch("");
    setParticipants([]);
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

  function switchTab(tab: TransactionsTab) {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab === "imported" ? "imported" : "transactions");
    if (tab === "imported" && importedFilters.status) {
      params.set("status", importedFilters.status);
    } else {
      params.delete("status");
    }
    setSearchParams(params, { replace: true });
  }

  function updateImportedFilter(nextFilters: ImportedFilters) {
    setImportedFilters(nextFilters);
    setSelectedImportedIds([]);
    setSelectAllFilteredImported(false);

    if (activeTab === "imported") {
      const params = new URLSearchParams(searchParams);
      params.set("tab", "imported");
      if (nextFilters.status) params.set("status", nextFilters.status);
      else params.delete("status");
      setSearchParams(params, { replace: true });
    }
  }

  function toggleImportedSelection(id: string) {
    setSelectAllFilteredImported(false);
    setSelectedImportedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id]
    );
  }

  function setAllVisibleImportedSelected(selected: boolean) {
    setSelectAllFilteredImported(false);
    setSelectedImportedIds(
      selected ? importedTransactions.map((row) => row.id) : []
    );
  }

  async function importOneImportedTransaction(
    transaction: ProviderImportedTransaction
  ) {
    const categoryId = transaction.categoryId;
    if (!categoryId) return;

    await importImportedTransaction.mutateAsync({
      id: transaction.id,
      categoryId
    });
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["transactions", "Transactions"],
            ["imported", "Imported Transactions"]
          ] as const
        ).map(([tab, label]) => (
          <Button
            key={tab}
            type="button"
            variant={activeTab === tab ? "primary" : "secondary"}
            onClick={() => switchTab(tab)}
          >
            {label}
            {tab === "imported" && pendingImportedCount > 0
              ? ` (${pendingImportedCount} pending)`
              : ""}
          </Button>
        ))}
      </div>

      {activeTab === "transactions" ? (
        <>
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
                  <CurrencySelect
                    label="Currency"
                    value={form.executionCurrency}
                    onChange={(executionCurrency) =>
                      setForm({ ...form, executionCurrency })
                    }
                  />
                  <SelectField
                    label="Type"
                    value={form.type}
                    onChange={(event) => {
                      const type = event.target.value as typeof form.type;
                      setForm({
                        ...form,
                        type,
                        ...(type === "transfer"
                          ? {
                              categoryId: "",
                              groupId: "",
                              isShared: false,
                              sharedTitle: "",
                              transferToAccountId:
                                form.accountId === form.transferToAccountId
                                  ? ""
                                  : form.transferToAccountId
                            }
                          : {})
                      });
                      if (type === "transfer") {
                        clearSharedTransactionDrafts();
                      }
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
                    label={
                      form.type === "transfer" ? "From account" : "Account"
                    }
                    value={form.accountId}
                    onChange={(event) => {
                      const accountId = event.target.value;
                      const selectedAccount = (accountsQuery.data ?? []).find(
                        (account) => account.id === accountId
                      );
                      setForm({
                        ...form,
                        accountId,
                        executionCurrency:
                          selectedAccount?.currency ?? form.executionCurrency,
                        transferToAccountId:
                          accountId && accountId === form.transferToAccountId
                            ? ""
                            : form.transferToAccountId
                      });
                    }}
                    required={form.type === "transfer"}
                  >
                    <option value="">
                      {form.type === "transfer" ? "Select account" : "None"}
                    </option>
                    {(form.type === "transfer"
                      ? sourceAccountOptions
                      : (accountsQuery.data ?? [])
                    ).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </SelectField>
                  {form.type === "transfer" ? (
                    <div className="grid gap-1">
                      <SelectField
                        label="To account"
                        value={form.transferToAccountId}
                        onChange={(event) => {
                          const transferToAccountId = event.target.value;
                          setForm({
                            ...form,
                            accountId:
                              transferToAccountId &&
                              transferToAccountId === form.accountId
                                ? ""
                                : form.accountId,
                            transferToAccountId
                          });
                        }}
                        required
                      >
                        <option value="">Select account</option>
                        {destinationAccountOptions.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </SelectField>
                      {transferAccountsMatch ? (
                        <p className="text-sm text-coral dark:text-orange-300">
                          {TRANSFER_ACCOUNT_VALIDATION_MESSAGE}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <>
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
                            isShared: canShareTransaction
                              ? groupId
                                ? form.isShared || !form.id
                                : form.isShared
                              : false
                          });
                          if (group && !form.id && canShareTransaction) {
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
                    </>
                  )}
                  <div className="md:col-span-2 xl:col-span-3">
                    <TextArea
                      label="Notes"
                      value={form.notes}
                      onChange={(event) =>
                        setForm({ ...form, notes: event.target.value })
                      }
                    />
                    {form.type === "transfer" ? (
                      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        Transfers move money between your own accounts, so they
                        cannot be shared or split.
                      </p>
                    ) : null}
                  </div>
                  {!form.id && canShareTransaction ? (
                    <div className="grid gap-3 rounded-md border border-slate-200 p-3 md:col-span-2 xl:col-span-3 dark:border-slate-800">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-pine"
                            checked={form.isShared}
                            onChange={(event) => {
                              setForm({
                                ...form,
                                isShared: event.target.checked
                              });
                              if (!event.target.checked) {
                                clearSharedTransactionDrafts();
                              }
                            }}
                          />
                          Shared transaction
                        </label>
                        {form.isShared ? (
                          <Button
                            type="button"
                            variant="secondary"
                            className="flex w-full items-center justify-center gap-2 sm:w-auto"
                            aria-expanded={areSharedFieldsOpen}
                            onClick={() =>
                              setAreSharedFieldsOpen((value) => !value)
                            }
                          >
                            <span>Participants</span>
                            <ChevronDown
                              aria-hidden="true"
                              className={`h-4 w-4 transition-transform ${
                                areSharedFieldsOpen ? "rotate-180" : ""
                              }`}
                            />
                          </Button>
                        ) : null}
                      </div>
                      {form.isShared && areSharedFieldsOpen ? (
                        <div className="grid gap-3">
                          <TextInput
                            label="Shared transaction title"
                            value={form.sharedTitle}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                sharedTitle: event.target.value
                              })
                            }
                            placeholder={form.name || "Shared transaction"}
                          />
                          {selectedGroup ? (
                            <div className="flex flex-col justify-between gap-2 rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-950 sm:flex-row sm:items-center">
                              <p className="text-slate-600 dark:text-slate-300">
                                Suggested split from {selectedGroup.name}: equal
                                share across {selectedGroup.members.length}{" "}
                                members.
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
                                        <p className="font-medium">
                                          {user.name}
                                        </p>
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
                                Assigned{" "}
                                {formatMoney(
                                  participantShareTotal,
                                  form.executionCurrency
                                )}{" "}
                                of{" "}
                                {Number.isFinite(transactionAmount)
                                  ? formatMoney(
                                      transactionAmount,
                                      form.executionCurrency
                                    )
                                  : formatMoney(0, form.executionCurrency)}
                                . Remaining owner share:{" "}
                                {formatMoney(
                                  Math.max(0, remainingSharedAmount),
                                  form.executionCurrency
                                )}
                                .
                              </p>
                            ) : (
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                Add an app user or manual participant to create
                                a shared transaction split.
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
                        transferAccountsInvalid ||
                        (shouldSaveSharedTransaction &&
                          (participants.length === 0 ||
                            remainingSharedAmount < 0))
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
                  setForm({
                    ...emptyForm,
                    executionCurrency: auth.user?.preferredCurrency || "USD"
                  });
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
                  className="flex w-full items-center justify-center gap-2 sm:w-auto"
                  aria-expanded={areAdvancedFiltersOpen}
                  onClick={() => setAreAdvancedFiltersOpen((value) => !value)}
                >
                  <span>Filters</span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 transition-transform ${
                      areAdvancedFiltersOpen ? "rotate-180" : ""
                    }`}
                  />
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
                        setFilters({
                          ...filters,
                          amountFrom: event.target.value
                        })
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
                        setFilters({
                          ...filters,
                          categoryId: event.target.value
                        })
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
                        setFilters({
                          ...filters,
                          accountId: event.target.value
                        })
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
                      <option value="settlement">
                        Settlement transactions
                      </option>
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
                  {formatMoney(transactionSummary.income, summaryCurrency)}
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
                  {formatMoney(transactionSummary.expenses, summaryCurrency)}
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
                  {formatMoney(transactionBalance, summaryCurrency)}
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
                  const isPendingClassification =
                    needsClassification(transaction);
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
                          {transaction.type === "transfer"
                            ? "Transfer"
                            : (transaction.category?.name ??
                              "Uncategorized")}{" "}
                          · {transactionAccountLabel(transaction)}
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
                            {transaction.type === "transfer"
                              ? "Pending classification: add from and to accounts."
                              : "Pending classification: add a category and account."}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={
                          transaction.type === "income"
                            ? "font-semibold text-pine dark:text-emerald-300"
                            : transaction.type === "transfer"
                              ? "font-semibold text-slate-700 dark:text-slate-200"
                              : "font-semibold text-coral dark:text-orange-300"
                        }
                      >
                        {formatMoney(
                          parseTransactionAmount(transaction.amount),
                          transaction.executionCurrency
                        )}
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
                              executionCurrency: transaction.executionCurrency,
                              type: transaction.type,
                              date: transaction.date.slice(0, 10),
                              accountId: transaction.accountId ?? "",
                              transferToAccountId:
                                transaction.transferToAccountId ?? "",
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
                          onClick={() =>
                            void confirmDeleteTransaction(transaction)
                          }
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
        </>
      ) : (
        <div className="grid gap-4">
          {pendingImportedCount > 0 ? (
            <Card>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <p className="font-semibold text-amber-900 dark:text-amber-100">
                  You have {pendingImportedCount} imported transaction
                  {pendingImportedCount === 1 ? "" : "s"} pending review.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={() =>
                    updateImportedFilter({
                      ...importedFilters,
                      status: "pending"
                    })
                  }
                >
                  Show pending
                </Button>
              </div>
            </Card>
          ) : null}

          <Card>
            <SearchComponent
              searchValue={importedFilters.search}
              searchPlaceholder="Search imported transactions"
              onSearchChange={(value) =>
                updateImportedFilter({ ...importedFilters, search: value })
              }
              filters={[
                {
                  id: "status",
                  label: "Status",
                  value: importedFilters.status,
                  onChange: (value) =>
                    updateImportedFilter({
                      ...importedFilters,
                      status: value
                    }),
                  options: [
                    { label: "Pending", value: "pending" },
                    { label: "Processed", value: "processed" },
                    { label: "Ignored", value: "ignored" }
                  ]
                },
                {
                  id: "account",
                  label: "Account",
                  value: importedFilters.accountId,
                  onChange: (value) =>
                    updateImportedFilter({
                      ...importedFilters,
                      accountId: value
                    }),
                  options: [
                    { label: "All accounts", value: "" },
                    ...(accountsQuery.data ?? []).map((account) => ({
                      label: account.name,
                      value: account.id
                    }))
                  ]
                },
                {
                  id: "category",
                  label: "Category",
                  value: importedFilters.categoryId,
                  onChange: (value) =>
                    updateImportedFilter({
                      ...importedFilters,
                      categoryId: value
                    }),
                  options: [
                    { label: "All categories", value: "" },
                    ...(categoriesQuery.data ?? []).map((category) => ({
                      label: category.name,
                      value: category.id
                    }))
                  ]
                }
              ]}
              sort={{
                value: importedSortBy,
                direction: importedSortDirection,
                onChange: setImportedSortBy,
                onDirectionChange: setImportedSortDirection,
                options: [
                  { label: "Date", value: "transactionDate" },
                  { label: "Description", value: "description" },
                  { label: "Amount", value: "amount" },
                  { label: "Provider", value: "provider" },
                  { label: "Status", value: "status" }
                ]
              }}
            >
              <Button
                type="button"
                variant="secondary"
                className="flex w-full items-center justify-center gap-2 sm:w-auto"
                aria-expanded={areImportedAdvancedFiltersOpen}
                onClick={() =>
                  setAreImportedAdvancedFiltersOpen((value) => !value)
                }
              >
                <span>Filters</span>
                <ChevronDown
                  aria-hidden="true"
                  className={`h-4 w-4 transition-transform ${
                    areImportedAdvancedFiltersOpen ? "rotate-180" : ""
                  }`}
                />
              </Button>
              {areImportedAdvancedFiltersOpen ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <TextInput
                    label="From"
                    type="date"
                    value={importedFilters.dateFrom}
                    onChange={(event) =>
                      updateImportedFilter({
                        ...importedFilters,
                        dateFrom: event.target.value
                      })
                    }
                  />
                  <TextInput
                    label="To"
                    type="date"
                    value={importedFilters.dateTo}
                    onChange={(event) =>
                      updateImportedFilter({
                        ...importedFilters,
                        dateTo: event.target.value
                      })
                    }
                  />
                  <TextInput
                    label="Minimum amount"
                    type="number"
                    step="0.01"
                    value={importedFilters.amountFrom}
                    onChange={(event) =>
                      updateImportedFilter({
                        ...importedFilters,
                        amountFrom: event.target.value
                      })
                    }
                  />
                  <TextInput
                    label="Maximum amount"
                    type="number"
                    step="0.01"
                    value={importedFilters.amountTo}
                    onChange={(event) =>
                      updateImportedFilter({
                        ...importedFilters,
                        amountTo: event.target.value
                      })
                    }
                  />
                  <SelectField
                    label="Provider account"
                    value={importedFilters.providerAccountId}
                    onChange={(event) =>
                      updateImportedFilter({
                        ...importedFilters,
                        providerAccountId: event.target.value
                      })
                    }
                  >
                    <option value="">All provider accounts</option>
                    {importedAccountOptions.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.label}
                      </option>
                    ))}
                  </SelectField>
                  <TextInput
                    label="Provider"
                    value={importedFilters.provider}
                    onChange={(event) =>
                      updateImportedFilter({
                        ...importedFilters,
                        provider: event.target.value
                      })
                    }
                  />
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full"
                      onClick={() => updateImportedFilter(emptyImportedFilters)}
                    >
                      Clear filters
                    </Button>
                  </div>
                </div>
              ) : null}
            </SearchComponent>
          </Card>

          <Card>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-semibold">Imported Transactions</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {importedTransactionsQuery.data?.total ?? 0} matching row
                  {(importedTransactionsQuery.data?.total ?? 0) === 1
                    ? ""
                    : "s"}
                  .
                </p>
              </div>
            </div>

            <ImportedTransactionSelectionToolbar
              totalFilteredCount={importedTransactionsQuery.data?.total ?? 0}
              visibleCount={importedTransactions.length}
              selectedCount={selectedImportedIds.length}
              selectedVisibleCount={selectedVisibleImportedCount}
              allFilteredSelected={selectAllFilteredImported}
              batchCategoryId={batchCategoryId}
              categories={categoriesQuery.data ?? []}
              isPendingFilter={importedFilters.status === "pending"}
              isIgnoredFilter={importedFilters.status === "ignored"}
              isImporting={batchImportImportedTransactions.isPending}
              isIgnoring={batchIgnoreImportedTransactions.isPending}
              isUnignoring={batchUnignoreImportedTransactions.isPending}
              onBatchCategoryChange={setBatchCategoryId}
              onVisibleSelectionChange={setAllVisibleImportedSelected}
              onAllFilteredSelectionChange={(selected) => {
                setSelectAllFilteredImported(selected);
                if (selected) setSelectedImportedIds([]);
              }}
              onImportSelected={() => batchImportImportedTransactions.mutate()}
              onIgnoreSelected={() => batchIgnoreImportedTransactions.mutate()}
              onUnignoreSelected={() => batchUnignoreImportedTransactions.mutate()}
            />

            {batchImportImportedTransactions.isError ||
            batchIgnoreImportedTransactions.isError ||
            batchUnignoreImportedTransactions.isError ? (
              <div className="mt-3 rounded-md border border-coral/40 bg-orange-50 p-3 text-sm text-coral dark:bg-orange-950/30 dark:text-orange-300">
                <p className="font-semibold">
                  {batchImportImportedTransactions.error?.message ??
                    batchIgnoreImportedTransactions.error?.message ??
                    batchUnignoreImportedTransactions.error?.message}
                </p>
                {batchErrors(
                  batchImportImportedTransactions.error ??
                    batchIgnoreImportedTransactions.error ??
                    batchUnignoreImportedTransactions.error
                ).map((error) => (
                  <p key={`${error.id}:${error.message}`} className="mt-1">
                    {error.id}: {error.message}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="mt-4 grid gap-3">
              {importedTransactions.map((transaction) => (
                <ImportedTransactionCard
                  key={transaction.id}
                  transaction={transaction}
                  categories={categoriesQuery.data ?? []}
                  isSelected={
                    selectAllFilteredImported ||
                    selectedImportedIds.includes(transaction.id)
                  }
                  isSelectionLocked={selectAllFilteredImported}
                  isImporting={importImportedTransaction.isPending}
                  isIgnoring={ignoreImportedTransaction.isPending}
                  isUnignoring={unignoreImportedTransaction.isPending}
                  onSelectedChange={() =>
                    toggleImportedSelection(transaction.id)
                  }
                  onCategoryChange={(categoryId) =>
                    updateImportedCategory.mutate({
                      id: transaction.id,
                      categoryId
                    })
                  }
                  onImport={() => void importOneImportedTransaction(transaction)}
                  onIgnore={() =>
                    ignoreImportedTransaction.mutate(transaction.id)
                  }
                  onUnignore={() =>
                    unignoreImportedTransaction.mutate(transaction.id)
                  }
                />
              ))}

              {importedTransactionsQuery.isLoading ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Loading imported transactions.
                </p>
              ) : null}

              {!importedTransactionsQuery.isLoading &&
              importedTransactions.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No imported transactions found.
                </p>
              ) : null}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
