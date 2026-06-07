import { ACCOUNT_TYPES, institutionCategories } from "@flowledger/shared";
import type { AccountType, ProviderConnectionFlow } from "@flowledger/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { SelectField, TextInput } from "../components/FormField";
import { SearchComponent } from "../components/SearchComponent";
import { apiRequest } from "../services/api";
import type { Account, Institution } from "../types/api";
import { applyCollectionControls, dateSortValue } from "../utils/search";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

export function AccountsPage() {
  const queryClient = useQueryClient();
  const [addMode, setAddMode] = useState<"manual" | "sync" | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("checking");
  const [identifier, setIdentifier] = useState("");
  const [initialBalance, setInitialBalance] = useState("0");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [archiveMode, setArchiveMode] = useState<"active" | "archived">(
    "active"
  );
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [institutionSearch, setInstitutionSearch] = useState("");
  const [institutionCategoryFilter, setInstitutionCategoryFilter] =
    useState("");
  const [institutionCountryFilter, setInstitutionCountryFilter] = useState("");
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<
    string | null
  >(null);
  const [activeConnection, setActiveConnection] =
    useState<ProviderConnectionFlow | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<AccountType>("checking");
  const [editIdentifier, setEditIdentifier] = useState("");
  const [editInitialBalance, setEditInitialBalance] = useState("0");

  const accountsQuery = useQuery({
    queryKey: ["accounts", archiveMode],
    queryFn: async () =>
      (
        await apiRequest<{ accounts: Account[] }>("/accounts", {
          query: {
            includeArchived: archiveMode === "archived" ? "true" : undefined
          }
        })
      ).accounts
  });

  const institutionsQuery = useQuery({
    queryKey: ["provider-institutions"],
    queryFn: async () =>
      (
        await apiRequest<{ institutions: Institution[] }>(
          "/providers/institutions"
        )
      ).institutions
  });

  const institutionCountries = useMemo(() => {
    return Array.from(
      new Set(
        (institutionsQuery.data ?? [])
          .map((institution) => institution.country)
          .filter((country): country is string => Boolean(country))
      )
    ).sort((left, right) => left.localeCompare(right));
  }, [institutionsQuery.data]);

  const visibleInstitutions = useMemo(() => {
    return applyCollectionControls(institutionsQuery.data ?? [], {
      search: institutionSearch,
      searchFields: (institution) => [
        institution.name,
        institution.country,
        institution.category,
        ...institution.supportedAccountTypes
      ],
      filters: [
        (institution) =>
          institutionCategoryFilter
            ? institution.category === institutionCategoryFilter
            : true,
        (institution) =>
          institutionCountryFilter
            ? institution.country === institutionCountryFilter
            : true
      ],
      sortBy: "name",
      sortDirection: "asc",
      sorters: {
        name: (institution) => institution.name
      }
    }).slice(0, 24);
  }, [
    institutionCategoryFilter,
    institutionCountryFilter,
    institutionSearch,
    institutionsQuery.data
  ]);

  const visibleAccounts = useMemo(() => {
    return applyCollectionControls(accountsQuery.data ?? [], {
      search,
      searchFields: (account) => [
        account.name,
        account.type,
        account.identifier
      ],
      filters: [
        (account) =>
          archiveMode === "archived" ? account.isArchived : !account.isArchived,
        (account) => (typeFilter ? account.type === typeFilter : true)
      ],
      sortBy,
      sortDirection,
      sorters: {
        name: (account) => account.name,
        createdAt: (account) => dateSortValue(account.createdAt),
        updatedAt: (account) => dateSortValue(account.updatedAt)
      }
    });
  }, [
    accountsQuery.data,
    archiveMode,
    search,
    sortBy,
    sortDirection,
    typeFilter
  ]);

  const createAccount = useMutation({
    mutationFn: () =>
      apiRequest("/accounts", {
        method: "POST",
        body: {
          name,
          type,
          identifier: identifier || null,
          initialBalance: Number(initialBalance || 0)
        }
      }),
    onSuccess: async () => {
      setName("");
      setIdentifier("");
      setInitialBalance("0");
      setAddMode(null);
      setIsFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    }
  });

  const startInstitutionConnection = useMutation({
    mutationFn: (institution: Institution) =>
      apiRequest<{ connection: ProviderConnectionFlow }>(
        "/providers/connections",
        {
          method: "POST",
          body: {
            institutionId: institution.institutionId,
            provider: institution.provider
          }
        }
      ),
    onSuccess: ({ connection }) => {
      setActiveConnection(connection);
      if (connection.url) {
        window.location.assign(connection.url);
      }
    }
  });

  const updateAccount = useMutation({
    mutationFn: (account: {
      id: string;
      name: string;
      type: AccountType;
      identifier: string;
      initialBalance: number;
    }) =>
      apiRequest(`/accounts/${account.id}`, {
        method: "PUT",
        body: {
          name: account.name,
          type: account.type,
          identifier: account.identifier || null,
          initialBalance: account.initialBalance
        }
      }),
    onSuccess: async () => {
      closeEditForm();
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  const archiveAccount = useMutation({
    mutationFn: (accountId: string) =>
      apiRequest(`/accounts/${accountId}/archive`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    }
  });

  const restoreAccount = useMutation({
    mutationFn: (accountId: string) =>
      apiRequest(`/accounts/${accountId}/restore`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    }
  });

  const deleteAccount = useMutation({
    mutationFn: (accountId: string) =>
      apiRequest(`/accounts/${accountId}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    await createAccount.mutateAsync();
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingAccountId) return;

    await updateAccount.mutateAsync({
      id: editingAccountId,
      name: editName,
      type: editType,
      identifier: editIdentifier,
      initialBalance: Number(editInitialBalance || 0)
    });
  }

  function closeForm() {
    setName("");
    setType("checking");
    setIdentifier("");
    setInitialBalance("0");
    setAddMode(null);
    setInstitutionSearch("");
    setInstitutionCategoryFilter("");
    setInstitutionCountryFilter("");
    setSelectedInstitutionId(null);
    setActiveConnection(null);
    setIsFormOpen(false);
  }

  function openEditForm(account: Account) {
    setEditingAccountId(account.id);
    setEditName(account.name);
    setEditType(account.type);
    setEditIdentifier(account.identifier ?? "");
    setEditInitialBalance(String(account.initialBalance ?? 0));
  }

  function closeEditForm() {
    setEditingAccountId(null);
    setEditName("");
    setEditType("checking");
    setEditIdentifier("");
    setEditInitialBalance("0");
  }

  async function confirmDelete(account: Account) {
    const confirmed = window.confirm(
      `Delete "${account.name}" permanently? This cannot be undone. Related financial data may also be deleted or disconnected from this account.`
    );
    if (!confirmed) return;
    await deleteAccount.mutateAsync(account.id);
  }

  return (
    <div className="grid gap-6">
      <Card>
        {isFormOpen ? (
          <>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <h2 className="text-lg font-semibold">
                {addMode === "manual"
                  ? "New manual account"
                  : addMode === "sync"
                    ? "Sync accounts"
                    : "Add account"}
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

            {addMode === null ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  className="rounded-md border border-slate-200 p-4 text-left transition hover:border-pine hover:bg-slate-50 dark:border-slate-800 dark:hover:border-emerald-700 dark:hover:bg-slate-900"
                  onClick={() => setAddMode("manual")}
                >
                  <p className="font-semibold">Manual account</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Create an account yourself and manage balances from your
                    transactions.
                  </p>
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-200 p-4 text-left transition hover:border-pine hover:bg-slate-50 dark:border-slate-800 dark:hover:border-emerald-700 dark:hover:bg-slate-900"
                  onClick={() => setAddMode("sync")}
                >
                  <p className="font-semibold">Sync accounts</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Pick a bank, broker, or institution and FlowLedger will
                    start the matching connection flow.
                  </p>
                </button>
              </div>
            ) : null}

            {addMode === "manual" ? (
              <form
                className="mt-4 grid gap-4 md:grid-cols-4"
                onSubmit={submit}
              >
                <TextInput
                  label="Name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
                <SelectField
                  label="Type"
                  value={type}
                  onChange={(event) =>
                    setType(event.target.value as AccountType)
                  }
                >
                  {ACCOUNT_TYPES.map((item) => (
                    <option key={item} value={item}>
                      {item.replace("_", " ")}
                    </option>
                  ))}
                </SelectField>
                <TextInput
                  label="Identifier"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                />
                <TextInput
                  label="Initial balance"
                  type="number"
                  step="0.01"
                  value={initialBalance}
                  onChange={(event) => setInitialBalance(event.target.value)}
                />
                <div className="flex flex-col gap-2 md:col-span-4 sm:flex-row">
                  <Button type="submit" disabled={createAccount.isPending}>
                    Save account
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setAddMode(null)}
                  >
                    Back
                  </Button>
                </div>
              </form>
            ) : null}

            {addMode === "sync" ? (
              <div className="mt-4 grid gap-4">
                <SearchComponent
                  searchValue={institutionSearch}
                  searchPlaceholder="Search banks, brokers, institutions"
                  onSearchChange={setInstitutionSearch}
                  filters={[
                    {
                      id: "category",
                      label: "Category",
                      value: institutionCategoryFilter,
                      onChange: setInstitutionCategoryFilter,
                      options: [
                        { label: "All categories", value: "" },
                        ...institutionCategories.map((item) => ({
                          label: item,
                          value: item
                        }))
                      ]
                    },
                    {
                      id: "country",
                      label: "Country",
                      value: institutionCountryFilter,
                      onChange: setInstitutionCountryFilter,
                      options: [
                        { label: "All countries", value: "" },
                        ...institutionCountries.map((country) => ({
                          label: country,
                          value: country
                        }))
                      ]
                    }
                  ]}
                />
                <div className="grid gap-3 md:grid-cols-2">
                  {visibleInstitutions.map((institution) => {
                    const institutionKey = `${institution.provider}:${institution.institutionId}`;
                    const isStarting =
                      selectedInstitutionId === institutionKey &&
                      startInstitutionConnection.isPending;

                    return (
                      <button
                        key={institutionKey}
                        type="button"
                        className="flex min-w-0 gap-3 rounded-md border border-slate-200 p-3 text-left transition hover:border-pine hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:hover:border-emerald-700 dark:hover:bg-slate-900"
                        disabled={startInstitutionConnection.isPending}
                        onClick={() => {
                          setSelectedInstitutionId(institutionKey);
                          setActiveConnection(null);
                          startInstitutionConnection.mutate(institution);
                        }}
                      >
                        {institution.logoUrl ? (
                          <img
                            src={institution.logoUrl}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded border border-slate-200 object-contain dark:border-slate-800"
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        ) : null}
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">
                            {institution.name}
                          </span>
                          <span className="block text-sm capitalize text-slate-500 dark:text-slate-400">
                            {[institution.category, institution.country]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          {institution.supportedAccountTypes.length > 0 ? (
                            <span className="mt-2 flex flex-wrap gap-1">
                              {institution.supportedAccountTypes
                                .slice(0, 4)
                                .map((item) => (
                                  <span
                                    key={item}
                                    className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                  >
                                    {item}
                                  </span>
                                ))}
                            </span>
                          ) : null}
                          {isStarting ? (
                            <span className="mt-2 block text-sm font-semibold text-pine dark:text-emerald-300">
                              Starting connection...
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {institutionsQuery.isLoading ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Loading institutions.
                  </p>
                ) : null}
                {institutionsQuery.isError ? (
                  <p className="text-sm text-coral dark:text-orange-300">
                    Institution picker is unavailable.
                  </p>
                ) : null}
                {!institutionsQuery.isLoading &&
                !institutionsQuery.isError &&
                visibleInstitutions.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No institutions found.
                  </p>
                ) : null}
                {startInstitutionConnection.isError ? (
                  <p className="text-sm text-coral dark:text-orange-300">
                    Could not start the connection flow.
                  </p>
                ) : null}
                {activeConnection && !activeConnection.url ? (
                  <p className="text-sm font-semibold text-pine dark:text-emerald-300">
                    Connection flow started for{" "}
                    {activeConnection.institutionName}.
                  </p>
                ) : null}
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setAddMode(null)}
                    disabled={startInstitutionConnection.isPending}
                  >
                    Back
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => {
              setAddMode(null);
              setIsFormOpen(true);
            }}
          >
            Add account
          </Button>
        )}
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Accounts</h2>
        <div className="mt-4">
          <SearchComponent
            searchValue={search}
            searchPlaceholder="Search accounts"
            onSearchChange={setSearch}
            filters={[
              {
                id: "type",
                label: "Type",
                value: typeFilter,
                onChange: setTypeFilter,
                options: [
                  { label: "All types", value: "" },
                  ...ACCOUNT_TYPES.map((item) => ({
                    label: item.replace("_", " "),
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
                { label: "Name", value: "name" },
                { label: "Created date", value: "createdAt" },
                { label: "Updated date", value: "updatedAt" }
              ]
            }}
            archiveToggle={{
              value: archiveMode,
              onChange: setArchiveMode
            }}
          />
        </div>
        <div className="mt-4 grid gap-3">
          {visibleAccounts.map((account) => (
            <div
              key={account.id}
              className="rounded-md border border-slate-200 p-3 dark:border-slate-800"
            >
              {editingAccountId === account.id ? (
                <form className="grid gap-3" onSubmit={submitEdit}>
                  <TextInput
                    label="Name"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    required
                  />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <SelectField
                      label="Type"
                      value={editType}
                      onChange={(event) =>
                        setEditType(event.target.value as AccountType)
                      }
                    >
                      {ACCOUNT_TYPES.map((item) => (
                        <option key={item} value={item}>
                          {item.replace("_", " ")}
                        </option>
                      ))}
                    </SelectField>
                    <TextInput
                      label="Identifier"
                      value={editIdentifier}
                      onChange={(event) =>
                        setEditIdentifier(event.target.value)
                      }
                    />
                    <TextInput
                      label="Initial balance"
                      type="number"
                      step="0.01"
                      value={editInitialBalance}
                      onChange={(event) =>
                        setEditInitialBalance(event.target.value)
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="submit" disabled={updateAccount.isPending}>
                      Save changes
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={closeEditForm}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{account.name}</p>
                      {account.isArchived ? (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          Archived
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm capitalize text-slate-500 dark:text-slate-400">
                      {account.type.replace("_", " ")}
                    </p>
                    <p
                      className={`text-sm font-semibold ${
                        (account.currentBalance ?? 0) >= 0
                          ? "text-pine dark:text-emerald-300"
                          : "text-coral dark:text-orange-300"
                      }`}
                    >
                      Balance {money.format(account.currentBalance ?? 0)}
                    </p>
                    {account.identifier ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {account.identifier}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => openEditForm(account)}
                    >
                      Edit
                    </Button>
                    {account.isArchived ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={restoreAccount.isPending}
                        onClick={() => restoreAccount.mutate(account.id)}
                      >
                        Restore
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={archiveAccount.isPending}
                        onClick={() => archiveAccount.mutate(account.id)}
                      >
                        Archive
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="danger"
                      disabled={deleteAccount.isPending}
                      onClick={() => confirmDelete(account)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {visibleAccounts.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No accounts found.
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
