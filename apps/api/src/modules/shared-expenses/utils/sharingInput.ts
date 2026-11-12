import type { SharedExpenseInput } from "@flowledger/shared";
import type { SharingParticipantInput } from "../types/sharedExpenses.types.js";

/**
 * Maps the legacy `{ userId?, participantName, shareAmount, paidAmount?, status? }` participants of
 * `POST /transactions`, `POST /shared-expenses` and `PUT /shared-expenses/:id` to the sharing editor shape.
 * `paidAmount` and `status` are dropped: payment state is server-owned.
 */
export function legacyParticipantsToSharing(
  participants: NonNullable<SharedExpenseInput["participants"]>
): SharingParticipantInput[] {
  return participants.map((participant) =>
    participant.userId
      ? { id: participant.id, userId: participant.userId, share: participant.shareAmount }
      : { id: participant.id, manualName: participant.participantName, share: participant.shareAmount }
  );
}
