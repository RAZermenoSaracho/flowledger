import type {
  Debt,
  PersonBalance,
  SettlementRequest
} from "../../../types/debts.types";
import { formatMoney } from "../../../utils/currency";
import { matchesSearch } from "../../../utils/search";

export function debtTitle(debt: Debt) {
  return debt.sharedExpense.title;
}

export function participantName(debt: Debt) {
  return debt.user?.name ?? debt.participantName;
}

export function partyName(debt: Debt, userId?: string | null) {
  if (!userId) return undefined;
  if (userId === debt.sharedExpense.ownerUserId)
    return debt.sharedExpense.owner?.name;
  if (userId === debt.userId) return participantName(debt);
  if (
    !debt.userId &&
    (userId === debt.debtorUserId || userId === debt.creditorUserId)
  ) {
    return participantName(debt);
  }
  return undefined;
}

export function otherParty(debt: Debt, viewerUserId?: string | null) {
  const otherUserId =
    debt.debtorUserId === viewerUserId
      ? debt.creditorUserId
      : debt.debtorUserId;
  const person =
    otherUserId === debt.sharedExpense.ownerUserId
      ? debt.sharedExpense.owner
      : otherUserId === debt.userId
        ? debt.user
        : undefined;

  return {
    key: otherUserId ?? `participant:${debt.id}`,
    person,
    fallbackName:
      partyName(debt, otherUserId) ?? participantName(debt) ?? "Unknown user"
  };
}

export function displayPerson(balance: PersonBalance) {
  return balance.person?.name ?? balance.fallbackName;
}

export function transactionTypeLabel(debt: Debt) {
  return debt.sharedExpense.transaction?.type === "income"
    ? "income split"
    : "expense split";
}

export function debtDescription(debt: Debt, viewerUserId?: string) {
  const otherPartyName =
    debt.debtorUserId === viewerUserId
      ? partyName(debt, debt.creditorUserId)
      : partyName(debt, debt.debtorUserId);

  return `${otherPartyName ?? "Unknown user"} · ${transactionTypeLabel(debt)} · ${formatMoney(
    debt.paidAmount,
    debt.currency
  )} settled of ${formatMoney(debt.shareAmount, debt.currency)}`;
}

export function statusLabel(debt: Debt) {
  if (debt.outstandingAmount <= 0) return "settled";
  if (debt.pendingSettlementAmount > 0) return "settlement pending";
  return debt.status;
}

export function availableSettlementAmount(debt: Debt) {
  return Math.max(0, debt.outstandingAmount - debt.pendingSettlementAmount);
}

export function debtMatchesSearch(
  debt: Debt,
  search: string,
  viewerUserId?: string
) {
  return matchesSearch(
    [
      debtTitle(debt),
      debtDescription(debt, viewerUserId),
      statusLabel(debt),
      debt.participantName,
      debt.user?.name,
      debt.user?.email,
      debt.sharedExpense.owner?.name,
      debt.sharedExpense.owner?.email,
      debt.sharedExpense.transaction?.name,
      debt.shareAmount,
      debt.paidAmount,
      debt.outstandingAmount
    ],
    search
  );
}

export function settlementRequestMatchesSearch(
  request: SettlementRequest,
  search: string
) {
  const debt = request.sharedExpenseParticipant;
  return matchesSearch(
    [
      debt?.sharedExpense.title,
      debt?.sharedExpense.transaction?.name,
      request.debtor?.name,
      request.debtor?.email,
      request.creditor?.name,
      request.creditor?.email,
      request.amount,
      request.status,
      request.note
    ],
    search
  );
}
