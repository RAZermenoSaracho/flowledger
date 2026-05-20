import { TRANSACTION_TYPES } from "@flowledger/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { SelectField, TextArea, TextInput } from "../components/FormField";
import { apiRequest } from "../services/api";
import type { Account, Category, Transaction } from "../types/api";

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
  notes: string;
};

const emptyForm: TransactionForm = {
  name: "",
  amount: "",
  type: "expense",
  date: new Date().toISOString().slice(0, 10),
  accountId: "",
  categoryId: "",
  notes: ""
};

export function TransactionsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TransactionForm>(emptyForm);
  const [filters, setFilters] = useState({
    search: "",
    type: "",
    accountId: "",
    categoryId: "",
    dateFrom: "",
    dateTo: ""
  });
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [areAdvancedFiltersOpen, setAreAdvancedFiltersOpen] = useState(false);

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
  const transactionsQuery = useQuery({
    queryKey: ["transactions", filters],
    queryFn: async () =>
      (
        await apiRequest<{ transactions: Transaction[] }>("/transactions", {
          query: filters
        })
      ).transactions
  });

  const saveTransaction = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        amount: Number(form.amount),
        type: form.type,
        date: form.date,
        accountId: form.accountId || null,
        categoryId: form.categoryId || null,
        notes: form.notes || null
      };
      return form.id
        ? apiRequest(`/transactions/${form.id}`, { method: "PUT", body })
        : apiRequest("/transactions", { method: "POST", body });
    },
    onSuccess: async () => {
      setForm(emptyForm);
      setIsFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["summary"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
    }
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    await saveTransaction.mutateAsync();
  }

  function closeForm() {
    setForm(emptyForm);
    setIsFormOpen(false);
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
                onChange={(event) =>
                  setForm({
                    ...form,
                    type: event.target.value as typeof form.type
                  })
                }
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
                value={form.categoryId}
                onChange={(event) =>
                  setForm({ ...form, categoryId: event.target.value })
                }
              >
                <option value="">None</option>
                {(categoriesQuery.data ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
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
              <div className="md:col-span-2 xl:col-span-3">
                <Button type="submit" disabled={saveTransaction.isPending}>
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
              setIsFormOpen(true);
            }}
          >
            Add transaction
          </Button>
        )}
      </Card>
      <div className="grid gap-4">
        <Card>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <TextInput
              label="Search"
              value={filters.search}
              onChange={(event) =>
                setFilters({ ...filters, search: event.target.value })
              }
            />
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
          </div>
          {areAdvancedFiltersOpen ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
            </div>
          ) : null}
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Transactions</h2>
          <div className="mt-4 grid gap-3">
            {(transactionsQuery.data ?? []).map((transaction) => (
              <div
                key={transaction.id}
                className="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-[1fr_auto_auto] md:items-center"
              >
                <div>
                  <Link
                    className="font-semibold text-pine"
                    to={`/transactions/${transaction.id}`}
                  >
                    {transaction.name}
                  </Link>
                  <p className="text-sm text-slate-500">
                    {new Date(transaction.date).toLocaleDateString()} ·{" "}
                    {transaction.category?.name ?? "Uncategorized"} ·{" "}
                    {transaction.account?.name ?? "No account"}
                  </p>
                </div>
                <span
                  className={
                    transaction.type === "income"
                      ? "font-semibold text-pine"
                      : "font-semibold text-coral"
                  }
                >
                  {money.format(transaction.amount)}
                </span>
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
                      notes: transaction.notes ?? ""
                    });
                    setIsFormOpen(true);
                  }}
                >
                  Edit
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
