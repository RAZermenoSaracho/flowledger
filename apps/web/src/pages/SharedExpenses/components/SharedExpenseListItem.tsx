import { RecordCard, type RecordCardAction } from "../../../components/RecordCard";
import type { SharedExpense } from "../../../types/sharedExpenses.types";
import { formatMoney } from "../../../utils/currency";

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

  const ownerName = sharedExpense.owner?.name ?? "the owner";
  if (type === "expense") {
    return isSettled ? `You owed ${ownerName}` : `You owe ${ownerName}`;
  }
  return isSettled ? `${ownerName} owed you` : `${ownerName} owes you`;
}

/** One row in the shared expenses list, showing split direction and participant status. */
export function SharedExpenseListItem({
  sharedExpense,
  isHighlighted,
  highlightedParticipantId,
  currentUserId,
  canEdit,
  onEdit
}: {
  sharedExpense: SharedExpense;
  isHighlighted: boolean;
  highlightedParticipantId: string | null;
  currentUserId: string | undefined;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const actions: RecordCardAction[] | undefined = canEdit
    ? [{ key: "edit", label: "Edit", onClick: onEdit }]
    : undefined;

  return (
    <RecordCard
      id={`shared-expense-${sharedExpense.id}`}
      highlightClassName={
        isHighlighted
          ? "border-pine bg-mint dark:border-emerald-500 dark:bg-emerald-950"
          : undefined
      }
      title={<p className="truncate font-semibold">{sharedExpense.title}</p>}
      subtitle={
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {sharedExpense.status} ·{" "}
          {splitDirectionLabel(sharedExpense, currentUserId)} ·{" "}
          <span className="font-semibold text-ink dark:text-slate-100">
            {formatMoney(
              sharedExpense.totalAmount,
              sharedExpense.transaction?.executionCurrency ?? "USD"
            )}
          </span>
        </p>
      }
      actions={actions}
      actionsLabel={`Actions for ${sharedExpense.title}`}
    >
      <div className="mt-3 grid gap-2">
        {sharedExpense.participants.map((participant) => (
          <div
            id={`shared-participant-${participant.id}`}
            key={participant.id}
            className={`rounded-md p-2 text-sm transition ${
              highlightedParticipantId === participant.id
                ? "bg-white ring-2 ring-pine dark:bg-slate-900 dark:ring-emerald-500"
                : "bg-slate-50 dark:bg-slate-950"
            }`}
          >
            <span className="font-medium">
              {participant.userId ? "App user" : "Manual"}
            </span>{" "}
            · {participant.participantName}:{" "}
            {formatMoney(participant.paidAmount, participant.currency)} settled
            of {formatMoney(participant.shareAmount, participant.currency)}
          </div>
        ))}
      </div>
    </RecordCard>
  );
}
