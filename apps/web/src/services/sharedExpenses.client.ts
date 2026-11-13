import type { SortDirection, WhereNode } from "../utils/searchDomain";
import { apiRequest } from "./api.client";
import type { SharedExpense } from "../types/sharedExpenses.types";
import type { SharedExpenseStatus } from "@flowledger/shared";

export type { SortDirection };

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

/** Fetches one shared expense the caller owns or participates in. */
export function getSharedExpense(sharedExpenseId: string) {
  return apiRequest<{ sharedExpense: SharedExpense }>(
    `/shared-expenses/${encodeURIComponent(sharedExpenseId)}`
  );
}

/** Updates the owner-editable fields of a shared expense; only the keys present are changed. */
export function updateSharedExpense(
  sharedExpenseId: string,
  body: { title?: string; status?: SharedExpenseStatus }
) {
  return apiRequest<{ sharedExpense: SharedExpense }>(
    `/shared-expenses/${encodeURIComponent(sharedExpenseId)}`,
    { method: "PUT", body }
  );
}

/** Accepts the caller's proposed share of a shared expense: the single line `participantId`, or every proposed line when omitted. */
export function acceptSharedExpense(sharedExpenseId: string, participantId?: string) {
  return apiRequest<unknown>(`/shared-expenses/${encodeURIComponent(sharedExpenseId)}/accept`, {
    method: "POST",
    ...(participantId ? { body: { participantId } } : {})
  });
}

/** Rejects the caller's proposed share of a shared expense: the single line `participantId`, or every proposed line when omitted. */
export function rejectSharedExpense(sharedExpenseId: string, participantId?: string) {
  return apiRequest<unknown>(`/shared-expenses/${encodeURIComponent(sharedExpenseId)}/reject`, {
    method: "POST",
    ...(participantId ? { body: { participantId } } : {})
  });
}
