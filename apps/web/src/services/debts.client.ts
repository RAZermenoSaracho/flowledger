import { apiRequest } from "./api";
import type { Debt, PersonBalance, SettlementRequest } from "../types/api";

export type DebtsResponse = {
  iOwe: Debt[];
  owedToMe: Debt[];
  balances: PersonBalance[];
  pendingSettlementRequests: SettlementRequest[];
  approvedSettlementRequests: SettlementRequest[];
  settledDebts: Debt[];
};

export function listDebts() {
  return apiRequest<DebtsResponse>("/debts");
}

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

export function settleDebtDirectly(debtId: string, note?: string | null) {
  return apiRequest<{ debt: Debt }>(`/debts/${debtId}/settle`, {
    method: "POST",
    body: { note }
  });
}

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

export function rejectSettlement(settlementId: string) {
  return apiRequest<{ settlementRequest: SettlementRequest }>(
    `/settlements/${settlementId}/reject`,
    { method: "POST" }
  );
}
