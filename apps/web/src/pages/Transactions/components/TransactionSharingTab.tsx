import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../../components/Button";
import {
  EditableField,
  editableControlClassName
} from "../../../components/EditableField";
import { RelatedList } from "../../../components/RelatedList";
import type { FormDraft } from "../../../types/common.types";
import type { Group } from "../../../types/groups.types";
import type { Transaction } from "../../../types/transactions.types";
import { searchUsers } from "../../../services/users.client";
import { formatMoney } from "../../../utils/currency";
import { formatEnumLabel } from "../../../utils/enumLabels";
import type {
  ParticipantDraft,
  TransactionDraft
} from "../types/transactions.types";
import {
  canRemoveParticipant,
  isShareLocked,
  sumParticipantShares
} from "../utils/transactionDraft";
import {
  addManualParticipant,
  addUserParticipant,
  removeParticipant,
  setParticipantShare,
  setShared,
  splitAmongGroup,
  splitEqually
} from "../utils/transactionDraftReducers";
import { formatPublicUser } from "../../../utils/publicUser";

const mutedClassName = "text-sm text-slate-500 dark:text-slate-400";

/** Consent label of a participant row: manual rows are always accepted, unsaved app rows are invited on Save. */
function responseLabel(participant: ParticipantDraft) {
  if (participant.source === "manual") return "Accepted";
  return participant.acceptance
    ? formatEnumLabel(participant.acceptance)
    : "Invited on save";
}

/**
 * Sharing tab of the Transaction Form View, for new and existing transactions alike. It edits the
 * sharing state of the draft: shared toggle, title, participants (any app user found by username,
 * or a manual name), editable shares, an equal-split helper and allocated/owner/unallocated
 * totals; nothing is sent until Save, which carries it with the other fields. For an existing
 * transaction (`transaction` set) rows also show what was paid and the participant's response;
 * a fully paid share is locked, a participant with a payment cannot be removed, and sharing
 * cannot be turned off while anyone has paid.
 */
export function TransactionSharingTab({
  draft,
  transaction,
  group,
  currentUserId
}: {
  draft: FormDraft<TransactionDraft>;
  transaction: Transaction | null;
  group: Group | undefined;
  currentUserId?: string;
}) {
  const [userSearch, setUserSearch] = useState("");
  const [manualName, setManualName] = useState("");
  const { values } = draft;
  const search = userSearch.trim();
  const usersQuery = useQuery({
    queryKey: ["users", "search", search],
    enabled: values.isShared && search.length >= 3,
    queryFn: async () => (await searchUsers(search)).users
  });

  if (values.type === "transfer") {
    return (
      <p className={mutedClassName}>
        Transfers move money between your own accounts, so they cannot be shared
        or split.
      </p>
    );
  }

  const amount = Number.isFinite(Number(values.amount))
    ? Number(values.amount)
    : 0;
  const allocated = sumParticipantShares(values.participants);
  const ownerShare = Math.max(0, amount - allocated);
  const unallocated = amount - allocated - ownerShare;
  const money = (value: number) => formatMoney(value, values.executionCurrency);
  const eligibleUsers = usersQuery.data ?? [];
  const hasPayments = values.participants.some(
    (participant) => (participant.paidAmount ?? 0) > 0
  );
  const unshareLocked =
    Boolean(transaction?.sharedExpense) && values.isShared && hasPayments;
  const participantsError = draft.fieldErrors.participants;

  return (
    <div className="grid gap-4">
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <input
          type="checkbox"
          className="h-4 w-4 accent-pine"
          checked={values.isShared}
          disabled={unshareLocked}
          aria-describedby={unshareLocked ? "unshare-locked" : undefined}
          onChange={(event) =>
            draft.update((current) => setShared(current, event.target.checked))
          }
        />
        Shared transaction
      </label>
      {unshareLocked ? (
        <p id="unshare-locked" className={mutedClassName}>
          Sharing cannot be turned off while a participant has paid. Settle or
          reverse the payments first.
        </p>
      ) : null}
      {values.isShared ? (
        <>
          <EditableField label="Shared transaction title">
            <input
              className={editableControlClassName}
              value={values.sharedTitle}
              placeholder={values.name || "Shared transaction"}
              onChange={(event) =>
                draft.setField("sharedTitle", event.target.value)
              }
            />
          </EditableField>
          {group && !transaction ? (
            <div className="flex flex-col justify-between gap-2 rounded-md bg-slate-50 p-3 text-sm sm:flex-row sm:items-center dark:bg-slate-950">
              <p className="text-slate-600 dark:text-slate-300">
                Suggested split from {group.name}: equal share across{" "}
                {group.members.length} members.
              </p>
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() =>
                  draft.update((current) =>
                    splitAmongGroup(current, group, currentUserId)
                  )
                }
              >
                Reset split
              </Button>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <EditableField label="Find app user">
              <input
                className={editableControlClassName}
                value={userSearch}
                placeholder="Search by username"
                onChange={(event) => setUserSearch(event.target.value)}
              />
            </EditableField>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <EditableField label="Manual participant">
                <input
                  className={editableControlClassName}
                  value={manualName}
                  placeholder="Name"
                  onChange={(event) => setManualName(event.target.value)}
                />
              </EditableField>
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => {
                  draft.update((current) =>
                    addManualParticipant(current, manualName)
                  );
                  setManualName("");
                }}
              >
                Add
              </Button>
            </div>
          </div>
          {search.length > 0 && search.length < 3 ? (
            <p className={mutedClassName}>
              Type at least 3 characters to search.
            </p>
          ) : null}
          {search.length >= 3 ? (
            <div className="grid gap-2">
              {usersQuery.isFetching ? (
                <p className={mutedClassName}>Searching app users...</p>
              ) : eligibleUsers.length > 0 ? (
                eligibleUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex flex-col justify-between gap-2 rounded-md border border-slate-200 p-2 text-sm sm:flex-row sm:items-center dark:border-slate-800"
                  >
                    <div>
                      <p className="font-medium">{formatPublicUser(user)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full sm:w-auto"
                      onClick={() => {
                        draft.update((current) =>
                          addUserParticipant(current, user)
                        );
                        setUserSearch("");
                      }}
                    >
                      Add app user
                    </Button>
                  </div>
                ))
              ) : (
                <p className={mutedClassName}>No eligible app users found.</p>
              )}
            </div>
          ) : null}
          <RelatedList<ParticipantDraft>
            title="Participants"
            rows={values.participants}
            rowKey={(participant) => participant.draftId}
            emptyText="Add an app user or manual participant to create a shared transaction split."
            canRemove={canRemoveParticipant}
            onRemove={(participant) =>
              draft.update((current) =>
                removeParticipant(current, participant.draftId)
              )
            }
            columns={[
              {
                key: "name",
                header: "Participant",
                cell: (participant) => (
                  <div>
                    <p className="font-semibold">
                      {participant.participantName}
                    </p>
                    <p className={mutedClassName}>
                      {participant.source === "app"
                        ? "App user"
                        : "Manual participant"}
                    </p>
                  </div>
                )
              },
              {
                key: "share",
                header: "Share",
                align: "right",
                cell: (participant) => {
                  const index = values.participants.indexOf(participant);
                  return (
                    <EditableField
                      label="Share"
                      hideLabel
                      error={
                        draft.fieldErrors[`participants.${index}.shareAmount`]
                      }
                    >
                      <input
                        className={editableControlClassName}
                        type="number"
                        step="0.01"
                        min="0.01"
                        disabled={isShareLocked(participant)}
                        value={participant.shareAmount}
                        onChange={(event) =>
                          draft.update((current) =>
                            setParticipantShare(
                              current,
                              participant.draftId,
                              event.target.value
                            )
                          )
                        }
                      />
                    </EditableField>
                  );
                }
              },
              ...(transaction
                ? [
                    {
                      key: "paid",
                      header: "Paid",
                      align: "right" as const,
                      cell: (participant: ParticipantDraft) =>
                        participant.id
                          ? formatMoney(
                              participant.paidAmount ?? 0,
                              values.executionCurrency
                            )
                          : "-"
                    },
                    {
                      key: "response",
                      header: "Response",
                      cell: (participant: ParticipantDraft) => (
                        <span>
                          {responseLabel(participant)}
                          {isShareLocked(participant) ? (
                            <span className={`block ${mutedClassName}`}>
                              Fully paid, locked
                            </span>
                          ) : null}
                        </span>
                      )
                    }
                  ]
                : [])
            ]}
            footer={
              <div className="grid gap-1 text-sm">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full sm:w-auto sm:justify-self-start"
                  onClick={() => draft.update(splitEqually)}
                >
                  Split equally
                </Button>
                <p className={mutedClassName}>Allocated: {money(allocated)}</p>
                <p className={mutedClassName}>
                  Owner share: {money(ownerShare)}
                </p>
                <p className={mutedClassName}>
                  Unallocated: {money(unallocated)}
                </p>
              </div>
            }
          />
          {participantsError ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {participantsError}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
