import type { SharedExpense } from "../../../types/sharedExpenses.types";
import { formatPublicUser } from "../../../utils/publicUser";

/**
 * Debt-direction label from `currentUserId`'s perspective. The owner sees the
 * aggregate view across every participant ("Participants owe you"); a
 * participant sees their own relationship to the owner specifically ("You
 * owe {owner}") — the same debtor/creditor pairing the backend derives in
 * `getDebtDirection` (an expense transaction's owner is the creditor and
 * each participant the debtor; an income transaction's owner is the debtor).
 *
 * Once `sharedExpense.status` is `"settled"`, the debt no longer exists —
 * the label switches to past tense ("owed") so it doesn't read as an
 * outstanding balance.
 */
export function splitDirectionLabel(
  sharedExpense: SharedExpense,
  currentUserId: string | undefined
) {
  const type = sharedExpense.transaction?.type;
  if (type !== "income" && type !== "expense") return "No debt direction";

  const isSettled = sharedExpense.status === "settled";
  const isOwner = currentUserId === sharedExpense.ownerUserId;
  if (isOwner) {
    if (type === "expense") {
      return isSettled ? "Participants owed you" : "Participants owe you";
    }
    return isSettled ? "You owed participants" : "You owe participants";
  }

  const ownerName = sharedExpense.owner ? formatPublicUser(sharedExpense.owner) : "the owner";
  if (type === "expense") {
    return isSettled ? `You owed ${ownerName}` : `You owe ${ownerName}`;
  }
  return isSettled ? `${ownerName} owed you` : `${ownerName} owes you`;
}
