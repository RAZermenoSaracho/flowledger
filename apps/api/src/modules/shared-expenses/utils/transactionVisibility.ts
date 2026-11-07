import { publicTransactionSelect } from "../../debts/utils/debtInclude.js";

/**
 * Returns a shared expense as `viewerUserId` may see it: the owner gets the full transaction, and anyone else
 * gets only {@link publicTransactionSelect}, so a participant never receives the owner's account, notes, or exchange details.
 */
export function withVisibleTransaction<
  T extends { ownerUserId: string; transaction?: Record<string, unknown> | null }
>(sharedExpense: T, viewerUserId: string): T {
  if (sharedExpense.ownerUserId === viewerUserId || !sharedExpense.transaction) {
    return sharedExpense;
  }

  const { transaction } = sharedExpense;
  const visible = Object.fromEntries(
    Object.keys(publicTransactionSelect).map((field) => [field, transaction[field]])
  );

  return { ...sharedExpense, transaction: visible };
}
