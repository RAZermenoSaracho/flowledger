import { apiRequest } from "./api.client";
import type { SharedExpense } from "../types/sharedExpenses.types";
import type { SharedExpenseStatus } from "@flowledger/shared";

export type SharedExpenseSortBy =
  | "title"
  | "totalAmount"
  | "status"
  | "createdAt"
  | "updatedAt";

export type SharedExpenseParticipantInput = {
  userId?: string | null;
  participantName: string;
  shareAmount: number;
  paidAmount?: number;
  status?: "pending" | "partial" | "paid";
};

export function listSharedExpenses(
  params: {
    status?: SharedExpenseStatus;
    statuses?: SharedExpenseStatus[];
    sortBy?: SharedExpenseSortBy;
    sortDirection?: "asc" | "desc";
  } = {}
) {
  return apiRequest<{ sharedExpenses: SharedExpense[] }>("/shared-expenses", {
    query: params
  });
}

export function createSharedExpense(body: {
  transactionId: string;
  title: string;
  status: SharedExpenseStatus;
  participants: SharedExpenseParticipantInput[];
}) {
  return apiRequest<{ sharedExpense: SharedExpense }>("/shared-expenses", {
    method: "POST",
    body
  });
}

export function updateSharedExpense(
  sharedExpenseId: string,
  body: {
    transactionId: string;
    title: string;
    status: SharedExpenseStatus;
    participants: SharedExpenseParticipantInput[];
  }
) {
  return apiRequest<{ sharedExpense: SharedExpense }>(
    `/shared-expenses/${sharedExpenseId}`,
    { method: "PUT", body }
  );
}
