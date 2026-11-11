import { badRequest } from "../../../utils/httpError.js";
import type { GuardParticipant } from "../types/sharedExpenses.types.js";

const cents = (value: number) => Math.round(value * 100);

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
    .reduce((sum, request) => sum + request.amount.toNumber(), 0);
}

/** Whether a participant has any payment or a pending/approved settlement request. */
export function hasSettlementActivity(participant: GuardParticipant) {
  return (
    participant.paidAmount.toNumber() > 0 ||
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
  const blocking = participants.find(
    (participant) => participant.paidAmount.toNumber() > 0 || pendingRequestAmount(participant) > 0
  );
  if (blocking) {
    throw fieldError(
      "type",
      `Cannot change the transaction type: ${blocking.participantName} has payments or pending settlement requests.`
    );
  }
}

/** Throws 400 on `field` when `participant`'s share is fully paid and `nextShare` differs, or when `nextShare` is below paid plus pending requests. */
export function assertShareEditable(participant: GuardParticipant, nextShare: number, field: string) {
  const current = participant.shareAmount.toNumber();
  if (cents(nextShare) === cents(current)) return;
  const paid = participant.paidAmount.toNumber();
  if (paid >= current) {
    throw fieldError(field, `${participant.participantName}'s share is fully paid and cannot be changed.`);
  }
  if (cents(nextShare) < cents(paid + pendingRequestAmount(participant))) {
    throw fieldError(
      field,
      `${participant.participantName}'s share cannot be below what was paid plus pending settlement requests.`
    );
  }
}

/** Throws 400 on `field` unless the participant has `paidAmount = 0` and no pending request. */
export function assertRemovable(participant: GuardParticipant, field: string) {
  if (participant.paidAmount.toNumber() > 0 || pendingRequestAmount(participant) > 0) {
    throw fieldError(
      field,
      `Cannot remove ${participant.participantName}: they have payments or pending settlement requests.`
    );
  }
}
