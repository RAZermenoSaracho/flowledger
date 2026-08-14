import type { SharedExpenseStatus } from "@flowledger/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import * as sharedExpensesClient from "../../../services/sharedExpenses.client";
import { listTransactions } from "../../../services/transactions.client";
import { searchUsers } from "../../../services/users.client";
import type { SharedExpense } from "../../../types/sharedExpenses.types";
import type { PublicUser } from "../../../types/users.types";
import type { ParticipantDraft } from "../types/sharedExpenses.types";

function participantStatus(shareAmount: string, paidAmount: string) {
  const share = Number(shareAmount);
  const paid = Number(paidAmount);

  if (paid >= share) return "paid";
  if (paid > 0) return "partial";
  return "pending";
}

/** State and handlers for the create/edit shared-expense form, including participant draft management. */
export function useSharedExpenseForm() {
  const queryClient = useQueryClient();
  const [transactionId, setTransactionId] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<SharedExpenseStatus>("open");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [participants, setParticipants] = useState<ParticipantDraft[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const trimmedUserSearch = userSearch.trim();

  const transactionsQuery = useQuery({
    queryKey: ["transactions", "shared-options"],
    queryFn: async () => (await listTransactions()).data
  });
  const userSearchQuery = useQuery({
    queryKey: ["users", "search", trimmedUserSearch],
    enabled: trimmedUserSearch.length > 1,
    queryFn: async () => (await searchUsers(trimmedUserSearch)).users
  });
  const selectedTransaction = (transactionsQuery.data ?? []).find(
    (transaction) => transaction.id === transactionId
  );
  const participantShareTotal = participants.reduce(
    (sum, participant) => sum + Number(participant.shareAmount || 0),
    0
  );
  const remainingAmount = selectedTransaction
    ? selectedTransaction.amount - participantShareTotal
    : 0;
  const sharesExceedTransactionAmount = Boolean(
    selectedTransaction && remainingAmount < 0
  );

  async function refreshAfterSave() {
    closeForm();
    await queryClient.invalidateQueries({ queryKey: ["shared-expenses"] });
    await queryClient.invalidateQueries({ queryKey: ["debts"] });
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
  }

  const createSharedExpense = useMutation({
    mutationFn: () =>
      sharedExpensesClient.createSharedExpense({
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
      }),
    onSuccess: refreshAfterSave
  });
  const updateSharedExpense = useMutation({
    mutationFn: () =>
      sharedExpensesClient.updateSharedExpense(editingId!, {
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

  return {
    transactionId,
    setTransactionId,
    title,
    setTitle,
    status,
    setStatus,
    editingId,
    participantName,
    setParticipantName,
    userSearch,
    setUserSearch,
    trimmedUserSearch,
    participants,
    isFormOpen,
    setIsFormOpen,
    transactionsQuery,
    userSearchQuery,
    selectedTransaction,
    participantShareTotal,
    remainingAmount,
    sharesExceedTransactionAmount,
    createSharedExpense,
    updateSharedExpense,
    submit,
    closeForm,
    addManualParticipant,
    addUserParticipant,
    updateParticipant,
    removeParticipant,
    editSharedExpense,
    isSaving
  };
}
