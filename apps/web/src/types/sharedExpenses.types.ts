import type { PublicUser } from "./users.types";
import type { SHARE_ACCEPTANCES, ParticipantStatus, SharedExpenseStatus } from "@flowledger/shared";
import type { Transaction } from "./transactions.types";

/** A participant's response state on a share. */
export type ShareAcceptance = (typeof SHARE_ACCEPTANCES)[number];

/** Participant record shape on a shared expense. */
export type SharedExpenseParticipant = {
  id: string;
  userId?: string | null;
  participantName: string;
  currency: string;
  shareAmount: number;
  paidAmount: number;
  status: ParticipantStatus;
  /** Consent state; manual participants are always `accepted`. Absent only in payloads that predate consent. */
  acceptance?: ShareAcceptance;
};

/** Transaction fields every viewer of a shared expense gets; the owner also receives the rest of the {@link Transaction}. */
export type SharedExpenseTransaction = Pick<
  Transaction,
  "id" | "name" | "amount" | "executionCurrency" | "type" | "date" | "categoryId" | "groupId"
>;

/** Shared expense record shape. */
export type SharedExpense = {
  id: string;
  transactionId: string;
  ownerUserId: string;
  title: string;
  totalAmount: number;
  status: SharedExpenseStatus;
  transaction?: SharedExpenseTransaction;
  owner?: PublicUser;
  participants: SharedExpenseParticipant[];
  createdAt: string;
  updatedAt: string;
};
