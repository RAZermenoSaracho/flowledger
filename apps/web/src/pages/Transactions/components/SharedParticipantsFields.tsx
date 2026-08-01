import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Button } from "../../../components/Button";
import { TextInput } from "../../../components/FormField";
import { searchUsers } from "../../../services/users.client";
import { formatMoney } from "../../../utils/currency";
import type { Group } from "../../../types/groups.types";
import type { PublicUser } from "../../../types/users.types";
import type { ParticipantDraft } from "../types/transactions.types";

export function SharedParticipantsFields({
  isShared,
  onIsSharedChange,
  areFieldsOpen,
  onToggleFieldsOpen,
  sharedTitle,
  onSharedTitleChange,
  transactionName,
  selectedGroup,
  onResetGroupSplit,
  participantName,
  onParticipantNameChange,
  onAddManualParticipant,
  userSearch,
  onUserSearchChange,
  onAddUserParticipant,
  participants,
  onUpdateParticipantShare,
  onRemoveParticipant,
  participantShareTotal,
  transactionAmount,
  remainingSharedAmount,
  executionCurrency
}: {
  isShared: boolean;
  onIsSharedChange: (checked: boolean) => void;
  areFieldsOpen: boolean;
  onToggleFieldsOpen: () => void;
  sharedTitle: string;
  onSharedTitleChange: (value: string) => void;
  transactionName: string;
  selectedGroup: Group | undefined;
  onResetGroupSplit: (group: Group) => void;
  participantName: string;
  onParticipantNameChange: (value: string) => void;
  onAddManualParticipant: () => void;
  userSearch: string;
  onUserSearchChange: (value: string) => void;
  onAddUserParticipant: (user: PublicUser) => void;
  participants: ParticipantDraft[];
  onUpdateParticipantShare: (draftId: string, value: string) => void;
  onRemoveParticipant: (draftId: string) => void;
  participantShareTotal: number;
  transactionAmount: number;
  remainingSharedAmount: number;
  executionCurrency: string;
}) {
  const trimmedUserSearch = userSearch.trim();
  const userSearchQuery = useQuery({
    queryKey: ["users", "search", trimmedUserSearch],
    enabled: isShared && trimmedUserSearch.length > 1,
    queryFn: async () => (await searchUsers(trimmedUserSearch)).users
  });
  const eligibleUsers = (userSearchQuery.data ?? []).filter(
    (user) =>
      !selectedGroup ||
      selectedGroup.members.some((member) => member.userId === user.id)
  );

  return (
    <div className="grid gap-3 rounded-md border border-slate-200 p-3 md:col-span-2 xl:col-span-3 dark:border-slate-800">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            className="h-4 w-4 accent-pine"
            checked={isShared}
            onChange={(event) => onIsSharedChange(event.target.checked)}
          />
          Shared transaction
        </label>
        {isShared ? (
          <Button
            type="button"
            variant="secondary"
            className="flex w-full items-center justify-center gap-2 sm:w-auto"
            aria-expanded={areFieldsOpen}
            onClick={onToggleFieldsOpen}
          >
            <span>Participants</span>
            <ChevronDown
              aria-hidden="true"
              className={`h-4 w-4 transition-transform ${
                areFieldsOpen ? "rotate-180" : ""
              }`}
            />
          </Button>
        ) : null}
      </div>
      {isShared && areFieldsOpen ? (
        <div className="grid gap-3">
          <TextInput
            label="Shared transaction title"
            value={sharedTitle}
            onChange={(event) => onSharedTitleChange(event.target.value)}
            placeholder={transactionName || "Shared transaction"}
          />
          {selectedGroup ? (
            <div className="flex flex-col justify-between gap-2 rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-950 sm:flex-row sm:items-center">
              <p className="text-slate-600 dark:text-slate-300">
                Suggested split from {selectedGroup.name}: equal share across{" "}
                {selectedGroup.members.length} members.
              </p>
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => onResetGroupSplit(selectedGroup)}
              >
                Reset split
              </Button>
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <TextInput
              label="Find app user"
              value={userSearch}
              onChange={(event) => onUserSearchChange(event.target.value)}
              placeholder="Search by name or email"
            />
            {!selectedGroup ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <TextInput
                  label="Manual participant"
                  value={participantName}
                  onChange={(event) =>
                    onParticipantNameChange(event.target.value)
                  }
                  className="sm:min-w-60"
                  placeholder="Name"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={onAddManualParticipant}
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
              ) : eligibleUsers.length > 0 ? (
                eligibleUsers.map((user) => (
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
                      onClick={() => onAddUserParticipant(user)}
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
                  <p className="font-semibold">{participant.participantName}</p>
                  <p className="text-slate-500 dark:text-slate-400">
                    {participant.source === "app"
                      ? `App user${
                          participant.email ? ` · ${participant.email}` : ""
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
                    onUpdateParticipantShare(
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
                  onClick={() => onRemoveParticipant(participant.draftId)}
                >
                  Remove
                </Button>
              </div>
            ))}
            {participants.length > 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Assigned {formatMoney(participantShareTotal, executionCurrency)}{" "}
                of{" "}
                {Number.isFinite(transactionAmount)
                  ? formatMoney(transactionAmount, executionCurrency)
                  : formatMoney(0, executionCurrency)}
                . Remaining owner share:{" "}
                {formatMoney(
                  Math.max(0, remainingSharedAmount),
                  executionCurrency
                )}
                .
              </p>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Add an app user or manual participant to create a shared
                transaction split.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
