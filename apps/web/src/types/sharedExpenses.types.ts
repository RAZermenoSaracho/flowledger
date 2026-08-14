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

/** Shared expense record shape. */
export type SharedExpense = {
  id: string;
  transactionId: string;
  ownerUserId: string;
  title: string;
  totalAmount: number;
  status: SharedExpenseStatus;
  transaction?: Transaction;
  owner?: { id: string; name: string };
  participants: SharedExpenseParticipant[];
  createdAt: string;
  updatedAt: string;
};
