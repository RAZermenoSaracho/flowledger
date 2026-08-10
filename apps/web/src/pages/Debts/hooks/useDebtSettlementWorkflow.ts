import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import * as debtsClient from "../../../services/debts.client";
import type { Account } from "../../../types/accounts.types";
import type { Category } from "../../../types/categories.types";
import type { Debt, SettlementRequest } from "../../../types/debts.types";
import type { Group } from "../../../types/groups.types";
import type {
  SettlementApprovalDraft,
  SettlementDraft
} from "../types/debts.types";
import { availableSettlementAmount } from "../utils/debtDisplay";

/** State and handlers for creating settlement requests and approving/rejecting incoming ones. */
export function useDebtSettlementWorkflow({
  groupById,
  privateExpenseCategories,
  privateIncomeCategories,
  accounts
}: {
  groupById: Map<string, Group>;
  privateExpenseCategories: Category[];
  privateIncomeCategories: Category[];
  accounts: Account[];
}) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, SettlementDraft>>({});
  const [approvalDrafts, setApprovalDrafts] = useState<
    Record<string, SettlementApprovalDraft>
  >({});
  const [selectedDebtIds, setSelectedDebtIds] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedApprovalIds, setSelectedApprovalIds] = useState<Set<string>>(
    () => new Set()
  );

  function settlementRequestBody(draft: SettlementDraft) {
    return {
      amount: Number(draft.amount),
      accountId: draft.accountId,
      categoryId: draft.categoryId,
      note: draft.note.trim() || null,
      paymentInfo: draft.paymentInfo.trim() || null
    };
  }

  function approvalBody(draft: SettlementApprovalDraft) {
    return {
      accountId: draft.accountId,
      categoryId: draft.categoryId,
      expenseOffsetCategoryId: draft.expenseOffsetCategoryId || null
    };
  }

  function createSettlementRequest(debtId: string, draft: SettlementDraft) {
    return debtsClient.createSettlementRequest(
      debtId,
      settlementRequestBody(draft)
    );
  }

  const requestSettlement = useMutation({
    mutationFn: ({
      debtId,
      draft
    }: {
      debtId: string;
      draft: SettlementDraft;
    }) => createSettlementRequest(debtId, draft),
    onSuccess: async (_data, variables) => {
      setDrafts((current) => {
        const next = { ...current };
        delete next[variables.debtId];
        return next;
      });
      setSelectedDebtIds((current) => {
        const next = new Set(current);
        next.delete(variables.debtId);
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
    }
  });
  const requestBatchSettlement = useMutation({
    mutationFn: async ({ selectedDebts }: { selectedDebts: Debt[] }) => {
      await debtsClient.createBatchSettlementRequests(
        selectedDebts.map((debt) => ({
          debtId: debt.id,
          ...settlementRequestBody(draftFor(debt))
        }))
      );
    },
    onSuccess: async (_data, variables) => {
      const settledIds = new Set(
        variables.selectedDebts.map((debt) => debt.id)
      );
      setSelectedDebtIds((current) => {
        const next = new Set(current);
        settledIds.forEach((id) => next.delete(id));
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
    }
  });
  const approveSettlement = useMutation({
    mutationFn: ({
      settlementId,
      draft
    }: {
      settlementId: string;
      draft: SettlementApprovalDraft;
    }) => debtsClient.approveSettlement(settlementId, approvalBody(draft)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });
  const approveBatchSettlements = useMutation({
    mutationFn: async (
      approvals: { settlementId: string; draft: SettlementApprovalDraft }[]
    ) => {
      await debtsClient.approveBatchSettlements(
        approvals.map(({ settlementId, draft }) => ({
          settlementRequestId: settlementId,
          ...approvalBody(draft)
        }))
      );
    },
    onSuccess: async (_data, variables) => {
      const approvedIds = new Set(
        variables.map((approval) => approval.settlementId)
      );
      setSelectedApprovalIds((current) => {
        const next = new Set(current);
        approvedIds.forEach((id) => next.delete(id));
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });
  const rejectSettlement = useMutation({
    mutationFn: (settlementId: string) =>
      debtsClient.rejectSettlement(settlementId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
    }
  });

  function categoryOptionsFor(debt: Debt) {
    const originalGroupId = debt.sharedExpense.transaction?.groupId ?? "";
    const originalGroup = originalGroupId
      ? groupById.get(originalGroupId)
      : undefined;
    return originalGroup
      ? originalGroup.categories.filter(
          (category) => category.type === "expense"
        )
      : privateExpenseCategories;
  }

  function incomeCategoryOptionsFor(request: SettlementRequest) {
    const originalGroupId =
      request.sharedExpenseParticipant?.sharedExpense.transaction?.groupId ??
      "";
    const originalGroup = originalGroupId
      ? groupById.get(originalGroupId)
      : undefined;
    return originalGroup
      ? originalGroup.categories.filter(
          (category) => category.type === "income"
        )
      : privateIncomeCategories;
  }

  function expenseOffsetCategoryOptionsFor(request: SettlementRequest) {
    const originalGroupId =
      request.sharedExpenseParticipant?.sharedExpense.transaction?.groupId ??
      "";
    const originalGroup = originalGroupId
      ? groupById.get(originalGroupId)
      : undefined;
    return originalGroup
      ? originalGroup.categories.filter(
          (category) => category.type === "expense"
        )
      : privateExpenseCategories;
  }

  function defaultApprovalDraftFor(
    request?: SettlementRequest
  ): SettlementApprovalDraft {
    const incomeCategories = request
      ? incomeCategoryOptionsFor(request)
      : privateIncomeCategories;
    const expenseOffsetCategories = request
      ? expenseOffsetCategoryOptionsFor(request)
      : privateExpenseCategories;
    const originalCategoryId =
      request?.sharedExpenseParticipant?.sharedExpense.transaction
        ?.categoryId ?? "";

    return {
      accountId: accounts[0]?.id ?? "",
      categoryId: incomeCategories[0]?.id ?? "",
      expenseOffsetCategoryId: expenseOffsetCategories.some(
        (category) => category.id === originalCategoryId
      )
        ? originalCategoryId
        : ""
    };
  }

  function approvalDraftFor(request: SettlementRequest) {
    return approvalDrafts[request.id] ?? defaultApprovalDraftFor(request);
  }

  function updateApprovalDraft(
    request: SettlementRequest,
    field: keyof SettlementApprovalDraft,
    value: string
  ) {
    setApprovalDrafts((current) => ({
      ...current,
      [request.id]: {
        ...(current[request.id] ?? defaultApprovalDraftFor(request)),
        [field]: value
      }
    }));
  }

  function defaultDraftFor(debt: Debt): SettlementDraft {
    const originalGroupId = debt.sharedExpense.transaction?.groupId ?? "";
    const originalCategoryId =
      originalGroupId && debt.sharedExpense.transaction?.categoryId
        ? debt.sharedExpense.transaction.categoryId
        : "";
    return {
      amount: String(availableSettlementAmount(debt)),
      accountId: accounts[0]?.id ?? "",
      categoryId: originalCategoryId || (privateExpenseCategories[0]?.id ?? ""),
      note: "",
      paymentInfo: ""
    };
  }

  function draftFor(debt: Debt) {
    return drafts[debt.id] ?? defaultDraftFor(debt);
  }

  function isSettlementDraftComplete(debt: Debt) {
    const draft = draftFor(debt);
    const amount = Number(draft.amount);
    return (
      Number.isFinite(amount) &&
      amount > 0 &&
      amount <= availableSettlementAmount(debt) &&
      Boolean(draft.accountId) &&
      Boolean(draft.categoryId)
    );
  }

  function updateDraft(
    debt: Debt,
    field: keyof SettlementDraft,
    value: string
  ) {
    setDrafts((current) => ({
      ...current,
      [debt.id]: {
        ...(current[debt.id] ?? defaultDraftFor(debt)),
        [field]: value
      }
    }));
  }

  function toggleDebtSelection(debtId: string) {
    setSelectedDebtIds((current) => {
      const next = new Set(current);
      if (next.has(debtId)) next.delete(debtId);
      else next.add(debtId);
      return next;
    });
  }

  function setDetailSelection(debtsToSelect: Debt[], selected: boolean) {
    setSelectedDebtIds((current) => {
      const next = new Set(current);
      debtsToSelect.forEach((debt) => {
        if (selected) next.add(debt.id);
        else next.delete(debt.id);
      });
      return next;
    });
  }

  async function submitSettlement(event: FormEvent, debt: Debt) {
    event.preventDefault();
    await requestSettlement.mutateAsync({
      debtId: debt.id,
      draft: draftFor(debt)
    });
  }

  async function submitBatchSettlement(
    event: FormEvent,
    selectedIOweThem: Debt[]
  ) {
    event.preventDefault();
    if (
      selectedIOweThem.length === 0 ||
      !selectedIOweThem.every(isSettlementDraftComplete)
    ) {
      return;
    }
    await requestBatchSettlement.mutateAsync({
      selectedDebts: selectedIOweThem
    });
  }

  function toggleApprovalSelection(settlementId: string) {
    setSelectedApprovalIds((current) => {
      const next = new Set(current);
      if (next.has(settlementId)) next.delete(settlementId);
      else next.add(settlementId);
      return next;
    });
  }

  function setApprovalSelection(
    requests: SettlementRequest[],
    selected: boolean
  ) {
    setSelectedApprovalIds((current) => {
      const next = new Set(current);
      requests.forEach((request) => {
        if (selected) next.add(request.id);
        else next.delete(request.id);
      });
      return next;
    });
  }

  async function submitBatchApproval(requests: SettlementRequest[]) {
    await approveBatchSettlements.mutateAsync(
      requests.map((request) => ({
        settlementId: request.id,
        draft: approvalDraftFor(request)
      }))
    );
  }

  const isActing =
    requestSettlement.isPending ||
    requestBatchSettlement.isPending ||
    approveSettlement.isPending ||
    approveBatchSettlements.isPending ||
    rejectSettlement.isPending;

  return {
    selectedDebtIds,
    setSelectedDebtIds,
    selectedApprovalIds,
    setSelectedApprovalIds,
    isActing,
    draftFor,
    isSettlementDraftComplete,
    updateDraft,
    categoryOptionsFor,
    incomeCategoryOptionsFor,
    expenseOffsetCategoryOptionsFor,
    approvalDraftFor,
    updateApprovalDraft,
    toggleDebtSelection,
    setDetailSelection,
    submitSettlement,
    submitBatchSettlement,
    toggleApprovalSelection,
    setApprovalSelection,
    submitBatchApproval,
    approveSettlement,
    rejectSettlement
  };
}
