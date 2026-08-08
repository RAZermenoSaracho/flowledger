import { apiRequest } from "./api.client";
import type { Debt, DebtsResponse, SettlementRequest } from "../types/debts.types";

/** Fetches the user's debts, computed balances, and settlement requests. */
export function listDebts() {
  return apiRequest<DebtsResponse>("/debts");
}

/** Creates a settlement request for a single debt. */
export function createSettlementRequest(
  debtId: string,
  body: {
    amount: number | string;
    accountId: string;
    categoryId: string;
    note?: string | null;
    paymentInfo?: string | null;
  }
) {
  return apiRequest<{ settlementRequest: SettlementRequest }>(
    `/debts/${debtId}/settlement-request`,
    { method: "POST", body }
  );
}

/** Creates settlement requests for multiple debts in one call. */
export function createBatchSettlementRequests(
  requests: {
    debtId: string;
    amount: number | string;
    accountId: string;
    categoryId: string;
    note?: string | null;
    paymentInfo?: string | null;
  }[]
) {
  return apiRequest<{ settlementRequests: SettlementRequest[] }>(
    "/debts/settlement-requests/batch",
    { method: "POST", body: { requests } }
  );
}

/** Settles a debt directly, bypassing the settlement-request approval flow. */
export function settleDebtDirectly(debtId: string, note?: string | null) {
  return apiRequest<{ debt: Debt }>(`/debts/${debtId}/settle`, {
    method: "POST",
    body: { note }
  });
}

/** Approves a pending settlement request. */
export function approveSettlement(
  settlementId: string,
  body: {
    accountId: string;
    categoryId: string;
    expenseOffsetCategoryId?: string | null;
  }
) {
  return apiRequest(`/settlements/${settlementId}/approve`, {
    method: "POST",
    body
  });
}

/** Approves multiple pending settlement requests in one call. */
export function approveBatchSettlements(
  approvals: {
    settlementRequestId: string;
    accountId: string;
    categoryId: string;
    expenseOffsetCategoryId?: string | null;
  }[]
) {
  return apiRequest("/settlements/approve/batch", {
    method: "POST",
    body: { approvals }
  });
}

/** Rejects a pending settlement request. */
export function rejectSettlement(settlementId: string) {
  return apiRequest<{ settlementRequest: SettlementRequest }>(
    `/settlements/${settlementId}/reject`,
    { method: "POST" }
  );
}
