import type { PublicUser } from "./users.types";
import type { ParticipantStatus, SharedExpenseStatus } from "@flowledger/shared";
import type { Transaction } from "./transactions.types";

/** Participant record shape on a shared expense. */
export type SharedExpenseParticipant = {
  id: string;
  userId?: string | null;
  participantName: string;
  currency: string;
  shareAmount: number;
  paidAmount: number;
  status: ParticipantStatus;
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
