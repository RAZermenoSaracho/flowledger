import type { DebtDirection, DebtDirectionInput } from "../types/debts.types.js";

/** Derives the debtor/creditor pair for a debt from its underlying transaction type. */
export function getDebtDirection(debt: DebtDirectionInput): DebtDirection | null {
  const participantUserId = debt.userId;

  if (debt.sharedExpense.transaction.type === "expense") {
    return {
      debtorUserId: participantUserId,
      creditorUserId: debt.sharedExpense.ownerUserId
    };
  }

  if (debt.sharedExpense.transaction.type === "income") {
    return {
      debtorUserId: debt.sharedExpense.ownerUserId,
      creditorUserId: participantUserId
    };
  }

  return null;
}

/** Whether `userId` is the debtor or creditor on this debt. */
export function isDebtRelevantToUser(debt: DebtDirectionInput, userId: string) {
  const direction = getDebtDirection(debt);
  return direction?.debtorUserId === userId || direction?.creditorUserId === userId;
}

/** Whether a settlement request's debtor/creditor still match the debt's current direction (guards against a settlement approved after the underlying transaction changed). */
export function isSettlementDirectionCurrent(
  debt: DebtDirectionInput,
  settlementRequest: { debtorUserId: string; creditorUserId: string }
) {
  const direction = getDebtDirection(debt);
  return (
    direction?.debtorUserId === settlementRequest.debtorUserId &&
    direction.creditorUserId === settlementRequest.creditorUserId
  );
}
