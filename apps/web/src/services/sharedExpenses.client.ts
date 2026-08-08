import { apiRequest } from "./api.client";
import type { SharedExpense } from "../types/sharedExpenses.types";
import type { SharedExpenseStatus } from "@flowledger/shared";

/** Sortable fields for the shared expenses list. */
export type SharedExpenseSortBy =
  | "title"
  | "totalAmount"
  | "status"
  | "createdAt"
  | "updatedAt";

/** Participant payload shape for creating or updating a shared expense. */
export type SharedExpenseParticipantInput = {
  userId?: string | null;
  participantName: string;
  shareAmount: number;
  paidAmount?: number;
  status?: "pending" | "partial" | "paid";
};

/** Fetches shared expenses with status/sort filters. */
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

/** Creates a shared expense from a transaction and its participant splits. */
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

/** Updates a shared expense's fields and participant splits. */
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
