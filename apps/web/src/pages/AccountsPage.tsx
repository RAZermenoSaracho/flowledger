import { ACCOUNT_TYPES } from "@flowledger/shared";
import type { AccountType } from "@flowledger/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { SelectField, TextInput } from "../components/FormField";
import { apiRequest } from "../services/api";
import type { Account } from "../types/api";

export function AccountsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("checking");
  const [identifier, setIdentifier] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<AccountType>("checking");
  const [editIdentifier, setEditIdentifier] = useState("");

  const accountsQuery = useQuery({
    queryKey: ["accounts", showArchived],
    queryFn: async () =>
      (
        await apiRequest<{ accounts: Account[] }>("/accounts", {
          query: { includeArchived: showArchived ? "true" : undefined }
        })
      ).accounts
  });

  const createAccount = useMutation({
    mutationFn: () =>
      apiRequest("/accounts", {
        method: "POST",
        body: { name, type, identifier: identifier || null }
      }),
    onSuccess: async () => {
      setName("");
      setIdentifier("");
      setIsFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    }
  });

  const updateAccount = useMutation({
    mutationFn: (account: {
      id: string;
      name: string;
      type: AccountType;
      identifier: string;
    }) =>
      apiRequest(`/accounts/${account.id}`, {
        method: "PUT",
        body: {
          name: account.name,
          type: account.type,
          identifier: account.identifier || null
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
      identifier: editIdentifier
    });
  }

  function closeForm() {
    setName("");
    setType("checking");
    setIdentifier("");
    setIsFormOpen(false);
  }

  function openEditForm(account: Account) {
    setEditingAccountId(account.id);
    setEditName(account.name);
    setEditType(account.type);
    setEditIdentifier(account.identifier ?? "");
  }

  function closeEditForm() {
    setEditingAccountId(null);
    setEditName("");
    setEditType("checking");
    setEditIdentifier("");
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
              <h2 className="text-lg font-semibold">New account</h2>
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={closeForm}
              >
                Cancel
              </Button>
            </div>
            <form className="mt-4 grid gap-4 md:grid-cols-3" onSubmit={submit}>
              <TextInput
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
              <SelectField
                label="Type"
                value={type}
                onChange={(event) => setType(event.target.value as AccountType)}
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
              <div className="md:col-span-3">
                <Button type="submit" disabled={createAccount.isPending}>
                  Save account
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
            Add account
          </Button>
        )}
      </Card>
      <Card>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <h2 className="text-lg font-semibold">Accounts</h2>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            Show archived
          </label>
        </div>
        <div className="mt-4 grid gap-3">
          {(accountsQuery.data ?? []).map((account) => (
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
                  <div className="grid gap-3 sm:grid-cols-2">
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
        </div>
      </Card>
    </div>
  );
}
