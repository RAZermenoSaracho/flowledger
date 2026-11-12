import { Prisma } from "@prisma/client";
import { badRequest } from "../../../utils/httpError.js";
import type { GuardParticipant } from "../types/sharedExpenses.types.js";

/** Builds a 400 whose `details.issues.fieldErrors[field]` carries `message`, the shape the web forms read. */
export function fieldError(field: string, message: string) {
  return badRequest(message, {
    issues: { formErrors: [], fieldErrors: { [field]: [message] } }
  });
}

/** Sum of a participant's pending settlement requests. */
export function pendingRequestAmount(participant: Pick<GuardParticipant, "settlementRequests">) {
  return participant.settlementRequests
    .filter((request) => request.status === "pending")
    .reduce((sum, request) => sum.plus(request.amount), new Prisma.Decimal(0));
}

/** Whether a participant has any payment or a pending/approved settlement request. */
export function hasSettlementActivity(participant: GuardParticipant) {
  return (
    participant.paidAmount.gt(0) ||
    participant.settlementRequests.some((request) => request.status === "pending" || request.status === "approved")
  );
}

/** Throws 400 on `field` when any participant has a payment or pending/approved settlement; `action` completes "Cannot ...". */
export function assertNoSettlementActivity(participants: GuardParticipant[], action: string, field: string) {
  const blocking = participants.find(hasSettlementActivity);
  if (blocking) {
    throw fieldError(
      field,
      `Cannot ${action}: ${blocking.participantName} has payments or settlement requests. Settle or reverse them first.`
    );
  }
}

/** Throws 400 on `type` when the transaction type changes (expense/income flip or to transfer) while a payment or pending request exists. */
export function assertTypeChangeAllowed(participants: GuardParticipant[], previousType: string, nextType: string) {
  if (previousType === nextType) return;
  const settled = participants.find(isSettledAllocation);
  if (settled) assertNotSettled(settled, "type");
  const blocking = participants.find(
    (participant) => participant.paidAmount.gt(0) || pendingRequestAmount(participant).gt(0)
  );
  if (blocking) {
    throw fieldError(
      "type",
      `Cannot change the transaction type: ${blocking.participantName} has payments or pending settlement requests.`
    );
  }
}

/** Whether an allocation is accepted and fully paid: from then on it is immutable and extra amounts need a new allocation. */
export function isSettledAllocation(participant: Pick<GuardParticipant, "acceptance" | "shareAmount" | "paidAmount">) {
  return (
    participant.acceptance === "accepted" && participant.paidAmount.gte(participant.shareAmount)
  );
}

/** Throws the 400 for any attempt to change or remove a settled allocation (see {@link isSettledAllocation}). */
export function assertNotSettled(participant: GuardParticipant, field: string) {
  if (isSettledAllocation(participant)) {
    throw fieldError(
      field,
      `${participant.participantName}'s allocation is fully settled and can't be changed; add an additional allocation instead.`
    );
  }
}

/**
 * Throws 400 on `field` when `participant` is settled and `nextShare` differs, when `nextShare` is below paid plus
 * pending requests, or when it raises a share that already has payment activity (extra amounts need a new allocation).
 */
export function assertShareEditable(participant: GuardParticipant, nextShare: Prisma.Decimal.Value, field: string) {
  const next = new Prisma.Decimal(nextShare);
  const current = participant.shareAmount;
  if (next.eq(current)) return;
  assertNotSettled(participant, field);
  const paid = participant.paidAmount;
  const pending = pendingRequestAmount(participant);
  if (next.lt(paid.plus(pending))) {
    throw fieldError(
      field,
      `${participant.participantName}'s share cannot be below what was paid plus pending settlement requests.`
    );
  }
  if (next.gt(current) && (paid.gt(0) || pending.gt(0))) {
    throw fieldError(
      field,
      `${participant.participantName}'s share already has payments or pending settlement requests; add an additional allocation for the extra amount.`
    );
  }
}

/** Throws 400 on `field` unless the participant is not settled, has `paidAmount = 0` and no pending request. */
export function assertRemovable(participant: GuardParticipant, field: string) {
  assertNotSettled(participant, field);
  if (participant.paidAmount.gt(0) || pendingRequestAmount(participant).gt(0)) {
    throw fieldError(
      field,
      `Cannot remove ${participant.participantName}: they have payments or pending settlement requests.`
    );
  }
}
