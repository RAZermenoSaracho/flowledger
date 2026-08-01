import type { AccountType } from "@flowledger/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import * as accountsClient from "../../../services/accounts.client";
import type { Account } from "../../../types/api";

export function useAccountEditForm() {
  const queryClient = useQueryClient();
  const [editingAccountId, setEditingAccountId] = useState<string | null>(
    null
  );
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<AccountType>("checking");
  const [editIdentifier, setEditIdentifier] = useState("");
  const [editCurrency, setEditCurrency] = useState("USD");
  const [editInitialBalance, setEditInitialBalance] = useState("0");

  function closeEditForm() {
    setEditingAccountId(null);
    setEditName("");
    setEditType("checking");
    setEditIdentifier("");
    setEditCurrency("USD");
    setEditInitialBalance("0");
  }

  const updateAccount = useMutation({
    mutationFn: (account: {
      id: string;
      name: string;
      type: AccountType;
      identifier: string;
      currency: string;
      initialBalance: number;
    }) =>
      accountsClient.updateAccount(account.id, {
        name: account.name,
        type: account.type,
        identifier: account.identifier || null,
        currency: account.currency,
        initialBalance: account.initialBalance
      }),
    onSuccess: async () => {
      closeEditForm();
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  const archiveAccount = useMutation({
    mutationFn: (accountId: string) => accountsClient.archiveAccount(accountId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    }
  });

  const restoreAccount = useMutation({
    mutationFn: (accountId: string) => accountsClient.restoreAccount(accountId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    }
  });

  const deleteAccount = useMutation({
    mutationFn: (accountId: string) => accountsClient.deleteAccount(accountId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  function openEditForm(account: Account) {
    setEditingAccountId(account.id);
    setEditName(account.name);
    setEditType(account.type);
    setEditIdentifier(account.identifier ?? "");
    setEditCurrency(account.currency);
    setEditInitialBalance(String(account.initialBalance ?? 0));
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingAccountId) return;

    await updateAccount.mutateAsync({
      id: editingAccountId,
      name: editName,
      type: editType,
      identifier: editIdentifier,
      currency: editCurrency,
      initialBalance: Number(editInitialBalance || 0)
    });
  }

  async function confirmDelete(account: Account) {
    const confirmed = window.confirm(
      `Delete "${account.name}" permanently? This cannot be undone. Related financial data may also be deleted or disconnected from this account.`
    );
    if (!confirmed) return;
    await deleteAccount.mutateAsync(account.id);
  }

  return {
    editingAccountId,
    editName,
    setEditName,
    editType,
    setEditType,
    editIdentifier,
    setEditIdentifier,
    editCurrency,
    setEditCurrency,
    editInitialBalance,
    setEditInitialBalance,
    updateAccount,
    archiveAccount,
    restoreAccount,
    deleteAccount,
    openEditForm,
    closeEditForm,
    submitEdit,
    confirmDelete
  };
}
