import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { useAuth } from "../../../hooks/useAuth";
import { createTransaction } from "../../../services/transactions.client";
import type { Account } from "../../../types/accounts.types";
import type { Category } from "../../../types/categories.types";
import type { Group } from "../../../types/groups.types";
import type { PublicUser } from "../../../types/users.types";
import type {
  ParticipantDraft,
  TransactionFormState
} from "../types/transactions.types";
import { todayDateString } from "../utils/transactions";
import { SharedParticipantsFields } from "./SharedParticipantsFields";
import { TransactionCoreFields } from "./TransactionCoreFields";

function emptyForm(defaultCurrency: string): TransactionFormState {
  return {
    name: "",
    amount: "",
    executionCurrency: defaultCurrency,
    type: "expense",
    date: todayDateString(),
    accountId: "",
    transferToAccountId: "",
    categoryId: "",
    groupId: "",
    notes: "",
    isShared: false,
    sharedTitle: ""
  };
}

/** Create-transaction form card, including optional shared-expense participant split. Open/closed state is controlled by the caller (see `AddRecordButton` in TransactionsPage.tsx). */
export function TransactionFormCard({
  isOpen,
  onClose,
  accounts,
  groups,
  personalCategories,
  defaultCurrency,
  onCreated
}: {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  groups: Group[];
  personalCategories: Category[];
  defaultCurrency: string;
  /** Called after `saveTransaction` already invalidates `transactions`/`accounts`/`groups`/`summary`/`cashflow` — only needed for behavior beyond that (e.g. closing a dialog); a no-op is a valid implementation. */
  onCreated: () => Promise<void>;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [areSharedFieldsOpen, setAreSharedFieldsOpen] = useState(true);
  const [form, setForm] = useState<TransactionFormState>(() =>
    emptyForm(defaultCurrency)
  );
  const [participantName, setParticipantName] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [participants, setParticipants] = useState<ParticipantDraft[]>([]);
  const canShareTransaction = form.type === "income" || form.type === "expense";

  const transactionAmount = Number(form.amount);
  const selectedGroup = groups.find((group) => group.id === form.groupId);
  const categoryOptions = form.groupId
    ? (selectedGroup?.categories ?? [])
    : personalCategories;
  const participantShareTotal = participants.reduce(
    (sum, participant) => sum + Number(participant.shareAmount || 0),
    0
  );
  const remainingSharedAmount = Number.isFinite(transactionAmount)
    ? transactionAmount - participantShareTotal
    : 0;
  const shouldSaveSharedTransaction = canShareTransaction && form.isShared;
  const transferAccountsInvalid =
    form.type === "transfer" &&
    Boolean(
      !form.accountId ||
      !form.transferToAccountId ||
      form.accountId === form.transferToAccountId
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
      return createTransaction(body);
    },
    onSuccess: async () => {
      setForm(emptyForm(defaultCurrency));
      onClose();
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: ["summary"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      await onCreated();
    }
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (transferAccountsInvalid) return;

    await saveTransaction.mutateAsync();
  }

  function closeForm() {
    setForm(emptyForm(defaultCurrency));
    setParticipantName("");
    setUserSearch("");
    setParticipants([]);
    setAreSharedFieldsOpen(true);
    onClose();
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

  if (!isOpen) return null;

  return (
    <Card>
      <>
          <h2 className="text-lg font-semibold">New transaction</h2>
          <form
            className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
            onSubmit={submit}
          >
            <TransactionCoreFields
              form={form}
              onFormChange={setForm}
              onSwitchedToTransfer={clearSharedTransactionDrafts}
              onGroupSelected={(group) => {
                if (canShareTransaction) suggestEqualGroupSplit(group);
              }}
              accounts={accounts}
              groups={groups}
              categoryOptions={categoryOptions}
            />
            {canShareTransaction ? (
              <SharedParticipantsFields
                isShared={form.isShared}
                onIsSharedChange={(checked) => {
                  setForm({ ...form, isShared: checked });
                  if (!checked) clearSharedTransactionDrafts();
                }}
                areFieldsOpen={areSharedFieldsOpen}
                onToggleFieldsOpen={() =>
                  setAreSharedFieldsOpen((value) => !value)
                }
                sharedTitle={form.sharedTitle}
                onSharedTitleChange={(sharedTitle) =>
                  setForm({ ...form, sharedTitle })
                }
                transactionName={form.name}
                selectedGroup={selectedGroup}
                onResetGroupSplit={suggestEqualGroupSplit}
                participantName={participantName}
                onParticipantNameChange={setParticipantName}
                onAddManualParticipant={addManualParticipant}
                userSearch={userSearch}
                onUserSearchChange={setUserSearch}
                onAddUserParticipant={addUserParticipant}
                participants={participants}
                onUpdateParticipantShare={updateParticipantShare}
                onRemoveParticipant={removeParticipant}
                participantShareTotal={participantShareTotal}
                transactionAmount={transactionAmount}
                remainingSharedAmount={remainingSharedAmount}
                executionCurrency={form.executionCurrency}
              />
            ) : null}
            <div className="flex gap-3 md:col-span-2 xl:col-span-3">
              <Button
                type="submit"
                className="flex-1"
                disabled={
                  saveTransaction.isPending ||
                  transferAccountsInvalid ||
                  (shouldSaveSharedTransaction &&
                    (participants.length === 0 || remainingSharedAmount < 0))
                }
              >
                Save transaction
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={closeForm}
              >
                Cancel
              </Button>
            </div>
          </form>
      </>
    </Card>
  );
}
