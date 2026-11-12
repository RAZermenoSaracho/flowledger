/** In-progress participant row in the shared-expense create/edit form. */
export type ParticipantDraft = {
  draftId: string;
  userId?: string | null;
  participantName: string;
  source: "app" | "manual";
  shareAmount: string;
  paidAmount: string;
};
