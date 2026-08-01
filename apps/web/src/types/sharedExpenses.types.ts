import type { ParticipantStatus, SharedExpenseStatus } from "@flowledger/shared";
import type { Transaction } from "./transactions.types";

export type SharedExpenseParticipant = {
  id: string;
  userId?: string | null;
  participantName: string;
  currency: string;
  shareAmount: number;
  paidAmount: number;
  status: ParticipantStatus;
};

export type SharedExpense = {
  id: string;
  transactionId: string;
  ownerUserId: string;
  title: string;
  totalAmount: number;
  status: SharedExpenseStatus;
  transaction?: Transaction;
  participants: SharedExpenseParticipant[];
  createdAt: string;
  updatedAt: string;
};
