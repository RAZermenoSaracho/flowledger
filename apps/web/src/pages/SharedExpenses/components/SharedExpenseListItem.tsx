import { RecordCard, type RecordCardAction } from "../../../components/RecordCard";
import type { SharedExpense } from "../../../types/sharedExpenses.types";
import { formatMoney } from "../../../utils/currency";

/** "You owe participants" / "Participants owe you" label based on the underlying transaction's type. */
export function splitDirectionLabel(sharedExpense: SharedExpense) {
  if (sharedExpense.transaction?.type === "income")
    return "You owe participants";
  if (sharedExpense.transaction?.type === "expense")
    return "Participants owe you";
  return "No debt direction";
}

/** One row in the shared expenses list, showing split direction and participant status. */
export function SharedExpenseListItem({
  sharedExpense,
  isHighlighted,
  highlightedParticipantId,
  canEdit,
  onEdit
}: {
  sharedExpense: SharedExpense;
  isHighlighted: boolean;
  highlightedParticipantId: string | null;
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
          {sharedExpense.status} · {splitDirectionLabel(sharedExpense)} ·{" "}
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
