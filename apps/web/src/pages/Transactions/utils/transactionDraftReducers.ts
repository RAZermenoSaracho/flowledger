import type { Account } from "../../../types/accounts.types";
import type { Category } from "../../../types/categories.types";
import type { Group } from "../../../types/groups.types";
import type { PublicUser } from "../../../types/users.types";
import type { ParticipantDraft, TransactionDraft } from "../types/transactions.types";

function toShare(value: number) {
  return (Math.round(value * 100) / 100).toFixed(2);
}

/** Choosing an account sets the currency from it and clears a transfer destination equal to it. */
export function selectAccount(
  draft: TransactionDraft,
  accountId: string,
  accounts: Account[]
): TransactionDraft {
  const account = accounts.find((item) => item.id === accountId);
  return {
    ...draft,
    accountId,
    executionCurrency: account?.currency ?? draft.executionCurrency,
    transferToAccountId:
      accountId && accountId === draft.transferToAccountId ? "" : draft.transferToAccountId
  };
}

/** Choosing a transfer destination clears a source account equal to it. */
export function selectTransferAccount(
  draft: TransactionDraft,
  transferToAccountId: string
): TransactionDraft {
  return {
    ...draft,
    transferToAccountId,
    accountId:
      transferToAccountId && transferToAccountId === draft.accountId ? "" : draft.accountId
  };
}

/**
 * Changes the type. The category survives only when it is one of `categoryOptions` of the new
 * type; a transfer also clears category, group and sharing and drops a destination equal to the source.
 */
export function changeType(
  draft: TransactionDraft,
  type: TransactionDraft["type"],
  categoryOptions: Category[]
): TransactionDraft {
  const categoryMatches = categoryOptions.some(
    (category) => category.id === draft.categoryId && category.type === type
  );
  if (type !== "transfer") {
    return { ...draft, type, categoryId: categoryMatches ? draft.categoryId : "" };
  }
  return {
    ...draft,
    type,
    categoryId: "",
    groupId: "",
    isShared: false,
    sharedTitle: "",
    participants: [],
    transferToAccountId:
      draft.accountId === draft.transferToAccountId ? "" : draft.transferToAccountId
  };
}

/** Replaces the participants with every member of `group` except `currentUserId`, splitting the amount equally across all members. */
export function splitAmongGroup(
  draft: TransactionDraft,
  group: Group,
  currentUserId: string | undefined
): TransactionDraft {
  const amount = Number(draft.amount);
  if (!Number.isFinite(amount) || amount <= 0 || group.members.length < 2) {
    return { ...draft, participants: [] };
  }
  const share = toShare(amount / group.members.length);
  return {
    ...draft,
    participants: group.members
      .filter((member) => member.userId !== currentUserId)
      .map((member) => ({
        draftId: member.id,
        userId: member.userId,
        participantName: member.user.name,
        email: member.user.email,
        source: "app",
        shareAmount: share
      }))
  };
}

/**
 * Changes the group and resets the category. With `sharing` (new drafts) a group also turns
 * sharing on and suggests the equal split among its members.
 */
export function selectGroup(
  draft: TransactionDraft,
  group: Group | undefined,
  options: { currentUserId: string | undefined; sharing: boolean }
): TransactionDraft {
  const next = {
    ...draft,
    groupId: group?.id ?? "",
    categoryId: group ? "" : draft.categoryId
  };
  if (!group || !options.sharing || draft.type === "transfer") return next;
  return splitAmongGroup({ ...next, isShared: true }, group, options.currentUserId);
}

/** Changes the amount; with `sharing` and a group already split, the equal split is recomputed. */
export function changeAmount(
  draft: TransactionDraft,
  amount: string,
  options: { group: Group | undefined; currentUserId: string | undefined; sharing: boolean }
): TransactionDraft {
  const next = { ...draft, amount };
  if (options.sharing && options.group && draft.participants.length > 0) {
    return splitAmongGroup(next, options.group, options.currentUserId);
  }
  return next;
}

/** Turns sharing on or off; turning it off drops the title and participants. */
export function setShared(draft: TransactionDraft, isShared: boolean): TransactionDraft {
  return isShared ? { ...draft, isShared } : { ...draft, isShared, sharedTitle: "", participants: [] };
}

/** Splits the amount equally between the owner and the current participants. */
export function splitEqually(draft: TransactionDraft): TransactionDraft {
  const amount = Number(draft.amount);
  if (!Number.isFinite(amount) || amount <= 0 || draft.participants.length === 0) return draft;
  const share = toShare(amount / (draft.participants.length + 1));
  return {
    ...draft,
    participants: draft.participants.map((participant) => ({ ...participant, shareAmount: share }))
  };
}

/** Adds an app user as a participant with an empty share, ignoring duplicates and non-members of `group`. */
export function addUserParticipant(
  draft: TransactionDraft,
  user: PublicUser,
  group: Group | undefined
): TransactionDraft {
  if (group && !group.members.some((member) => member.userId === user.id)) return draft;
  if (draft.participants.some((participant) => participant.userId === user.id)) return draft;
  const participant: ParticipantDraft = {
    draftId: crypto.randomUUID(),
    userId: user.id,
    participantName: user.name,
    email: user.email,
    source: "app",
    shareAmount: ""
  };
  return { ...draft, participants: [...draft.participants, participant] };
}

/** Adds a manual (non-app) participant with an empty share; a blank name is ignored. */
export function addManualParticipant(draft: TransactionDraft, name: string): TransactionDraft {
  const participantName = name.trim();
  if (!participantName) return draft;
  const participant: ParticipantDraft = {
    draftId: crypto.randomUUID(),
    participantName,
    source: "manual",
    shareAmount: ""
  };
  return { ...draft, participants: [...draft.participants, participant] };
}

/** Sets one participant's share input. */
export function setParticipantShare(
  draft: TransactionDraft,
  draftId: string,
  shareAmount: string
): TransactionDraft {
  return {
    ...draft,
    participants: draft.participants.map((participant) =>
      participant.draftId === draftId ? { ...participant, shareAmount } : participant
    )
  };
}

/** Removes one participant. */
export function removeParticipant(draft: TransactionDraft, draftId: string): TransactionDraft {
  return {
    ...draft,
    participants: draft.participants.filter((participant) => participant.draftId !== draftId)
  };
}
