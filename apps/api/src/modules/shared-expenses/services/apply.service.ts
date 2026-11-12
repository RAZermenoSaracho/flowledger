import { Prisma } from "@prisma/client";
import { createDedupedNotifications } from "../../notifications/services/create.service.js";
import type { NotificationInput } from "../../notifications/types/notifications.types.js";
import { moneyText } from "../../notifications/utils/moneyText.js";
import { participantStatus } from "../../debts/utils/debtCalculations.js";
import { deleteSharedTransactionData } from "../../transactions/utils/sharedTransactionCleanup.js";
import { userLabel, publicUserSelect, publicizeUsers } from "../../users/utils/publicUser.js";
import { HttpError } from "../../../utils/httpError.js";
import type { SharingInput } from "../types/sharedExpenses.types.js";
import { assertShareableTransaction, validateSharedExpenseParticipants } from "../utils/assertions.js";
import {
  assertNoSettlementActivity,
  assertNotSettled,
  assertRemovable,
  assertShareEditable,
  assertTypeChangeAllowed,
  fieldError,
  hasSettlementActivity
} from "../utils/shareGuards.js";
import { normalizeSharedExpenseParticipants } from "./read.service.js";

/** The transaction columns the helper needs; `type` is the value after the surrounding update. */
type SharedTransaction = {
  id: string;
  name: string;
  amount: Prisma.Decimal;
  type: "income" | "expense" | "transfer";
  executionCurrency: string;
};

type NormalizedParticipant = Awaited<ReturnType<typeof normalizeSharedExpenseParticipants>>[number];

const cents = (value: number | string | Prisma.Decimal) => Math.round(Number(value) * 100);

/** Include for every shared expense this module returns: participants carry only the public user columns, so snapshots never show a real name. */
export const sharedExpenseResponseInclude = {
  transaction: true,
  participants: { include: { user: { select: publicUserSelect } } }
} as const;

/**
 * The one writer of sharing state for a transaction, run inside the caller's `$transaction`: enable/edit/disable
 * sharing, diffing participants by `id`/`userId` (manual ones by name) so payment fields survive, enforcing every
 * settlement guard (400 with `details.issues.fieldErrors`), applying the consent rules (new app users `proposed`,
 * manual always `accepted`, raised share or direction flip `accepted` -> `proposed`, changed rejected share ->
 * `proposed`) and sending de-duplicated notifications. Client payment fields never reach it.
 *
 * `previousType` is the transaction type before the surrounding update. `input` undefined means "no structural
 * change" (the transaction's type or amount changed): direction flips still re-propose, and a transfer removes sharing.
 * @returns the shared expense with `transaction` and `participants`, or `null` when none remains.
 */
export async function applySharedExpenseToTransaction(
  tx: Prisma.TransactionClient,
  ownerUserId: string,
  transaction: SharedTransaction,
  previousType: SharedTransaction["type"],
  input?: SharingInput
) {
  const existing = await tx.sharedExpense.findUnique({
    where: { transactionId: transaction.id },
    include: { participants: { include: { settlementRequests: true } } }
  });
  const directionFlip =
    Boolean(existing) && previousType !== "transfer" && transaction.type !== "transfer" && previousType !== transaction.type;
  if (existing) assertTypeChangeAllowed(existing.participants, previousType, transaction.type);

  if (transaction.type === "transfer") {
    if (input?.enabled) assertShareableTransaction(transaction);
    if (existing) await removeSharedExpense(tx, ownerUserId, existing);
    return null;
  }

  if (input?.enabled === false) {
    if (existing) {
      assertNoSettlementActivity(existing.participants, "stop sharing", "sharedExpense");
      await removeSharedExpense(tx, ownerUserId, existing);
    }
    return null;
  }

  if (!existing && !input) return null;
  const requested = input?.enabled ? input.participants : undefined;
  const existingUserIds = new Set(
    (existing?.participants ?? []).flatMap((participant) => (participant.userId ? [participant.userId] : []))
  );
  const normalized = requested
    ? await normalizeSharedExpenseParticipants(ownerUserId, requested, { client: tx, existingUserIds })
    : undefined;

  const owner = await tx.user.findUniqueOrThrow({ where: { id: ownerUserId }, select: publicUserSelect });
  const ownerLabel = userLabel(owner);
  const title = (input?.enabled ? input.title : undefined) ?? existing?.title ?? transaction.name;
  const notifications: NotificationInput[] = [];
  const base = (sharedExpenseId: string, participantId: string) => ({
    sharedExpenseId,
    transactionId: transaction.id,
    participantId
  });

  if (!existing) {
    const participants = normalized ?? [];
    const newUserIds = participants.flatMap((participant) => (participant.userId ? [participant.userId] : []));
    if (new Set(newUserIds).size !== newUserIds.length) throw new HttpError(400, "A participant can only be added once");
    validateSharedExpenseParticipants(
      transaction.amount,
      participants.map((participant) => ({ shareAmount: participant.share }))
    );
    const created = await tx.sharedExpense.create({
      data: {
        transactionId: transaction.id,
        title,
        totalAmount: transaction.amount,
        ownerUserId,
        participants: {
          create: participants.map((participant) => ({
            userId: participant.userId ?? null,
            participantName: participant.participantName,
            shareAmount: new Prisma.Decimal(participant.share),
            currency: transaction.executionCurrency,
            acceptance: participant.userId ? ("proposed" as const) : ("accepted" as const)
          }))
        }
      },
      include: { participants: true }
    });
    for (const participant of created.participants) {
      if (!participant.userId) continue;
      notifications.push({
        userId: participant.userId,
        senderUserId: ownerUserId,
        type: "shared_expense_invited",
        title: "Shared expense invitation",
        message: `${ownerLabel} proposed ${moneyText(participant.shareAmount)} of ${title} for you.`,
        metadata: base(created.id, participant.id)
      });
    }
    await createDedupedNotifications(tx, notifications);
    return publicizeUsers(
      await tx.sharedExpense.findUniqueOrThrow({ where: { id: created.id }, include: sharedExpenseResponseInclude })
    );
  }

  type Row = (typeof existing.participants)[number];
  const matchedIds = new Set<string>();
  const desired: { row: Row | null; input: NormalizedParticipant | null; share: number; index: number }[] = [];
  if (normalized) {
    const claim = (row: Row) => {
      if (matchedIds.has(row.id)) throw new HttpError(400, "A participant can only be added once");
      matchedIds.add(row.id);
    };
    const rowFor: (Row | null)[] = normalized.map((participant, index) => {
      if (!participant.id) return null;
      const byId = existing.participants.find((candidate) => candidate.id === participant.id);
      if (!byId) {
        throw fieldError(`sharedExpense.participants.${index}.id`, "Participant does not belong to this shared expense");
      }
      if ((participant.userId ?? null) !== byId.userId) {
        throw fieldError(`sharedExpense.participants.${index}.id`, "Participant id does not match the given user");
      }
      if (!participant.userId && participant.manualName && !byId.userId && byId.participantName !== participant.participantName) {
        assertNotSettled(byId, `sharedExpense.participants.${index}.id`);
      }
      claim(byId);
      return byId;
    });
    const newLinesPerUser = new Map<string, number>();
    normalized.forEach((participant, index) => {
      let row = rowFor[index] ?? null;
      if (!row && participant.userId) {
        const userRows = existing.participants.filter((candidate) => candidate.userId === participant.userId);
        if (userRows.length > 1 && !userRows.every((candidate) => matchedIds.has(candidate.id))) {
          throw fieldError(`sharedExpense.participants.${index}.id`, "participant id required");
        }
        if (userRows.length === 1 && !matchedIds.has(userRows[0]!.id)) row = userRows[0]!;
        else if (userRows.length > 0) {
          if (!userRows.every(hasSettlementActivity)) {
            throw fieldError(
              `sharedExpense.participants.${index}.share`,
              "Edit the existing allocation instead of adding another one for the same user."
            );
          }
        }
        const lines = (newLinesPerUser.get(participant.userId) ?? 0) + (row ? 0 : 1);
        newLinesPerUser.set(participant.userId, lines);
        if (lines > 1) throw new HttpError(400, "A participant can only be added once");
        if (row) claim(row);
      } else if (!row && !participant.userId) {
        row =
          existing.participants.find(
            (candidate) =>
              !candidate.userId && candidate.participantName === participant.participantName && !matchedIds.has(candidate.id)
          ) ?? null;
        if (row) claim(row);
      }
      desired.push({ row, input: participant, share: Number(participant.share), index });
    });
  } else {
    existing.participants.forEach((row, index) =>
      desired.push({ row, input: null, share: row.shareAmount.toNumber(), index })
    );
  }

  const removals = normalized ? existing.participants.filter((row) => !matchedIds.has(row.id)) : [];
  validateSharedExpenseParticipants(
    transaction.amount,
    desired.map((entry) => ({ shareAmount: entry.share }))
  );

  const updatedMessage = (verb: string) => `${ownerLabel} ${verb} ${title}.`;
  for (const entry of desired) {
    if (!entry.row) {
      const participant = entry.input!;
      const row = await tx.sharedExpenseParticipant.create({
        data: {
          sharedExpenseId: existing.id,
          userId: participant.userId ?? null,
          participantName: participant.participantName,
          shareAmount: new Prisma.Decimal(participant.share),
          currency: transaction.executionCurrency,
          acceptance: participant.userId ? "proposed" : "accepted"
        }
      });
      if (row.userId) {
        notifications.push({
          userId: row.userId,
          senderUserId: ownerUserId,
          type: "shared_expense_invited",
          title: "Shared expense invitation",
          message: `${ownerLabel} proposed ${moneyText(row.shareAmount)} of ${title} for you.`,
          metadata: base(existing.id, row.id)
        });
      }
      continue;
    }

    const { row } = entry;
    const field = `sharedExpense.participants.${entry.index}.share`;
    assertShareEditable(row, entry.share, field);
    const amountChanged = cents(entry.share) !== cents(row.shareAmount);
    const raised = cents(entry.share) > cents(row.shareAmount);
    let acceptance = row.acceptance;
    if (row.userId) {
      if (row.acceptance === "accepted" && (raised || directionFlip)) acceptance = "proposed";
      else if (row.acceptance === "rejected" && amountChanged) acceptance = "proposed";
    }
    if (amountChanged || acceptance !== row.acceptance) {
      const updated = await tx.sharedExpenseParticipant.updateMany({
        where: {
          id: row.id,
          paidAmount: row.paidAmount,
          acceptance: row.acceptance,
          ...(amountChanged
            ? {
                settlementRequests: {
                  none: {
                    status: "pending",
                    id: { notIn: row.settlementRequests.filter((request) => request.status === "pending").map((request) => request.id) }
                  }
                }
              }
            : {})
        },
        data: {
          shareAmount: new Prisma.Decimal(entry.share),
          status: participantStatus(entry.share, row.paidAmount.toNumber()),
          acceptance
        }
      });
      if (updated.count !== 1) throw changedWhileEditing();
    }
    if (row.userId && acceptance === "proposed" && row.acceptance !== "proposed") {
      notifications.push({
        userId: row.userId,
        senderUserId: ownerUserId,
        type: "shared_expense_updated",
        title: "Shared expense updated",
        message: `${updatedMessage("changed the proposal for")} Your share is now ${moneyText(entry.share)}; accept it again.`,
        metadata: base(existing.id, row.id)
      });
    }
  }

  removals.forEach((row, index) => assertRemovable(row, `sharedExpense.participants.removed.${index}`));
  if (removals.length > 0) {
    const remainingUserIds = new Set(
      desired.flatMap((entry) => {
        const userId = entry.row?.userId ?? entry.input?.userId;
        return userId ? [userId] : [];
      })
    );
    const removedUserIds = [
      ...new Set(removals.flatMap((row) => (row.userId && !remainingUserIds.has(row.userId) ? [row.userId] : [])))
    ];
    const retainedUserRemovals = removals.filter((row) => row.userId && remainingUserIds.has(row.userId));
    for (const row of removals) {
      const deleted = await tx.sharedExpenseParticipant.deleteMany({
        where: { id: row.id, paidAmount: row.paidAmount, settlementRequests: { none: { status: "pending" } } }
      });
      if (deleted.count !== 1) throw changedWhileEditing();
    }
    await tx.notification.deleteMany({
      where: { userId: { in: removedUserIds }, metadata: { path: ["sharedExpenseId"], equals: existing.id } }
    });
    for (const row of retainedUserRemovals) {
      await tx.notification.deleteMany({
        where: { userId: row.userId!, metadata: { path: ["participantId"], equals: row.id } }
      });
    }
    removedUserIds.forEach((userId) =>
      notifications.push({
        userId,
        senderUserId: ownerUserId,
        type: "shared_expense_updated",
        title: "Removed from shared expense",
        message: updatedMessage("removed you from"),
        metadata: { transactionId: transaction.id }
      })
    );
  }

  await tx.sharedExpense.update({
    where: { id: existing.id },
    data: { title, totalAmount: transaction.amount }
  });
  await createDedupedNotifications(tx, notifications);
  return publicizeUsers(
    await tx.sharedExpense.findUniqueOrThrow({ where: { id: existing.id }, include: sharedExpenseResponseInclude })
  );
}

function changedWhileEditing() {
  return new HttpError(409, "This shared expense changed while you were editing; please reload");
}

async function removeSharedExpense(
  tx: Prisma.TransactionClient,
  ownerUserId: string,
  existing: {
    id: string;
    title: string;
    transactionId: string;
    participants: { id: string; userId: string | null; settlementRequests: { id: string }[] }[];
  }
) {
  const recipients = existing.participants.flatMap((participant) => (participant.userId ? [participant.userId] : []));
  await deleteSharedTransactionData(tx, existing);
  await createDedupedNotifications(
    tx,
    recipients.map((userId) => ({
      userId,
      senderUserId: ownerUserId,
      type: "shared_expense_updated" as const,
      title: "Shared expense removed",
      message: `${existing.title} is no longer shared.`,
      metadata: { transactionId: existing.transactionId }
    }))
  );
}
