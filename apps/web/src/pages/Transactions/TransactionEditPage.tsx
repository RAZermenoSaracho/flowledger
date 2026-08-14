import { TRANSACTION_TYPES } from "@flowledger/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { CurrencySelect } from "../../components/CurrencySelect";
import { SelectField, TextArea, TextInput } from "../../components/FormField";
import { listAccounts } from "../../services/accounts.client";
import { listCategories } from "../../services/categories.client";
import { listGroups } from "../../services/groups.client";
import {
  getTransaction,
  updateTransaction as updateTransactionRequest
} from "../../services/transactions.client";
import type { Transaction } from "../../types/transactions.types";
import type { TransactionEditForm } from "./types/transactions.types";
import { todayDateString } from "./utils/transactions";

const TRANSFER_ACCOUNT_VALIDATION_MESSAGE =
  "Source and destination accounts must be different";

function formFromTransaction(transaction: Transaction): TransactionEditForm {
  return {
    name: transaction.name,
    amount: String(transaction.amount),
    executionCurrency: transaction.executionCurrency,
    type: transaction.type,
    date: transaction.date.slice(0, 10),
    accountId: transaction.accountId ?? "",
    transferToAccountId: transaction.transferToAccountId ?? "",
    categoryId: transaction.categoryId ?? "",
    groupId: transaction.groupId ?? "",
    notes: transaction.notes ?? ""
  };
}

/** Edit form page for a single transaction. */
export function TransactionEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TransactionEditForm | null>(null);

  const transactionQuery = useQuery({
    queryKey: ["transaction", id],
    enabled: Boolean(id),
    queryFn: async () => (await getTransaction(id!)).transaction
  });
  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => (await listAccounts()).accounts
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await listCategories()).categories
  });
  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: async () => (await listGroups()).groups
  });

  useEffect(() => {
    if (form || !transactionQuery.data) return;
    setForm(formFromTransaction(transactionQuery.data));
  }, [form, transactionQuery.data]);

  const updateTransaction = useMutation({
    mutationFn: () => {
      if (!form || !id) throw new Error("Transaction is not loaded");

      return updateTransactionRequest(id, {
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
        notes: form.notes || null
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["transaction", id] });
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: ["summary"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      navigate("/transactions");
    }
  });

  if (!form) {
    return <Card>Loading transaction...</Card>;
  }

  const selectedGroup = (groupsQuery.data ?? []).find(
    (group) => group.id === form.groupId
  );
  const categoryOptions = form.groupId
    ? (selectedGroup?.categories ?? [])
    : (categoriesQuery.data ?? []);
  const sourceAccountOptions = (accountsQuery.data ?? []).filter(
    (account) => account.id !== form.transferToAccountId
  );
  const destinationAccountOptions = (accountsQuery.data ?? []).filter(
    (account) => account.id !== form.accountId
  );
  const transferAccountsMatch =
    form.type === "transfer" &&
    Boolean(
      form.accountId &&
      form.transferToAccountId &&
      form.accountId === form.transferToAccountId
    );
  const transferAccountsInvalid =
    form.type === "transfer" &&
    Boolean(
      !form.accountId || !form.transferToAccountId || transferAccountsMatch
    );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (transferAccountsInvalid) return;

    await updateTransaction.mutateAsync();
  }

  return (
    <div className="grid gap-6">
      <Card>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <h2 className="text-lg font-semibold">Edit transaction</h2>
          <Link
            className="text-sm font-semibold text-pine dark:text-emerald-300"
            to="/transactions"
          >
            Back to transactions
          </Link>
        </div>

        <form
          className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          onSubmit={submit}
        >
          <TextInput
            label="Name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
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
            label={form.type === "transfer" ? "From account" : "Account"}
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
              const type = event.target.value as TransactionEditForm["type"];
              setForm({
                ...form,
                type,
                ...(type === "transfer"
                  ? {
                      categoryId: "",
                      groupId: "",
                      transferToAccountId:
                        form.accountId === form.transferToAccountId
                          ? ""
                          : form.transferToAccountId
                    }
                  : {})
              });
            }}
          >
            {TRANSACTION_TYPES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </SelectField>
          <div className="relative">
            <TextInput
              label="Date"
              type="date"
              value={form.date}
              onChange={(event) =>
                setForm({ ...form, date: event.target.value })
              }
              required
              className="box-border max-w-full appearance-none"
            />
            {/* The native date picker's own reset control is browser-rendered
                and unreliable on some mobile browsers — this bypasses it
                entirely by writing today's date straight to form state. */}
            <button
              type="button"
              onClick={() => setForm({ ...form, date: todayDateString() })}
              className="absolute right-0 top-0 text-xs font-semibold text-pine hover:underline dark:text-emerald-300"
            >
              Reset to today
            </button>
          </div>
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
                value={form.categoryId}
                onChange={(event) =>
                  setForm({ ...form, categoryId: event.target.value })
                }
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
                  setForm({
                    ...form,
                    groupId,
                    categoryId: groupId ? "" : form.categoryId
                  });
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
          </div>
          <div className="flex flex-col gap-2 sm:flex-row md:col-span-2 xl:col-span-3">
            <Button
              type="submit"
              disabled={updateTransaction.isPending || transferAccountsInvalid}
            >
              Save transaction
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate("/transactions")}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
