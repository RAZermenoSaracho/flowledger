import type { SortDirection, WhereNode } from "../utils/searchDomain";
import { apiRequest } from "./api.client";
import type { SharedExpense } from "../types/sharedExpenses.types";
import type { SharedExpenseStatus } from "@flowledger/shared";

export type { SortDirection };

/** Participant payload shape for creating or updating a shared expense. */
export type SharedExpenseParticipantInput = {
  userId?: string | null;
  participantName: string;
  shareAmount: number;
  paidAmount?: number;
  status?: "pending" | "partial" | "paid";
};

/** The wire shape `GET /shared-expenses` accepts — see apps/api's shared-expenses read.service.ts. */
export type SharedExpensesQuery = {
  where?: WhereNode;
  sort?: { field: string; direction: SortDirection }[];
};

/** Fetches shared expenses for a DSQL query. */
export function listSharedExpenses(query: SharedExpensesQuery = {}) {
  return apiRequest<{ sharedExpenses: SharedExpense[] }>("/shared-expenses", {
    query: { query: JSON.stringify(query) }
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
