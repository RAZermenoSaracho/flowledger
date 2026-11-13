import type { Debt, PersonBalance } from "../../../types/debts.types";
import { formatMoney } from "../../../utils/currency";
import { compare, isPositive, subtract } from "../../../utils/money";
import { formatPublicUser } from "../../../utils/publicUser";

/** Shared expense title for a debt. */
export function debtTitle(debt: Debt) {
  return debt.sharedExpense.title;
}

/** Display name of the debt's non-owner participant, falling back to the stored participant name. */
export function participantName(debt: Debt) {
  return debt.user ? formatPublicUser(debt.user) : debt.participantName;
}

/** Display name of whichever party (owner or participant) on the debt matches the given user id. */
export function partyName(debt: Debt, userId?: string | null) {
  if (!userId) return undefined;
  if (userId === debt.sharedExpense.ownerUserId)
    return debt.sharedExpense.owner
      ? formatPublicUser(debt.sharedExpense.owner)
      : undefined;
  if (userId === debt.userId) return participantName(debt);
  if (
    !debt.userId &&
    (userId === debt.debtorUserId || userId === debt.creditorUserId)
  ) {
    return participantName(debt);
  }
  return undefined;
}

/** The counterparty (key/person/fallback name) on a debt relative to the viewer. */
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

/** Display name for a `PersonBalance`, falling back to its stored name. */
export function displayPerson(balance: PersonBalance) {
  return balance.person
    ? formatPublicUser(balance.person)
    : balance.fallbackName;
}

/** "income split" or "expense split" label for the transaction a debt originated from. */
export function transactionTypeLabel(debt: Debt) {
  return debt.sharedExpense.transaction?.type === "income"
    ? "income split"
    : "expense split";
}

/** Human-readable "counterparty · split type · amount settled" description of a debt for the viewer. */
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

/** Derives a "settled" / "settlement pending" / raw status label for a debt. */
export function statusLabel(debt: Debt) {
  if (!isPositive(debt.outstandingAmount, debt.currency)) return "settled";
  if (isPositive(debt.pendingSettlementAmount, debt.currency)) return "settlement pending";
  return debt.status;
}

/** Outstanding amount still available to settle as an exact decimal string in the debt's currency: outstanding minus already-pending settlement amount, floored at zero. */
export function availableSettlementAmount(debt: Debt): string {
  return compare(debt.outstandingAmount, debt.pendingSettlementAmount, debt.currency) > 0
    ? subtract(debt.outstandingAmount, debt.pendingSettlementAmount, debt.currency)
    : "0";
}

