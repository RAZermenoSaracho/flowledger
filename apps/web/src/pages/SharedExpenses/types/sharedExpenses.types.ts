export type ParticipantDraft = {
  draftId: string;
  userId?: string | null;
  participantName: string;
  email?: string;
  source: "app" | "manual";
  shareAmount: string;
  paidAmount: string;
};
