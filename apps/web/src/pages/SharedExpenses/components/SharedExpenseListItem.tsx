import { Button } from "../../../components/Button";
import type { SharedExpense } from "../../../types/sharedExpenses.types";
import { formatMoney } from "../../../utils/currency";

export function splitDirectionLabel(sharedExpense: SharedExpense) {
  if (sharedExpense.transaction?.type === "income")
    return "You owe participants";
  if (sharedExpense.transaction?.type === "expense")
    return "Participants owe you";
  return "No debt direction";
}

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
  return (
    <div
      id={`shared-expense-${sharedExpense.id}`}
      className={`rounded-md border p-3 transition ${
        isHighlighted
          ? "border-pine bg-mint dark:border-emerald-500 dark:bg-emerald-950"
          : "border-slate-200 dark:border-slate-800"
      }`}
    >
      <div className="flex flex-col justify-between gap-2 sm:flex-row">
        <div>
          <p className="font-semibold">{sharedExpense.title}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {sharedExpense.status} · {splitDirectionLabel(sharedExpense)}
          </p>
        </div>
        <p className="font-semibold">
          {formatMoney(
            sharedExpense.totalAmount,
            sharedExpense.transaction?.executionCurrency ?? "USD"
          )}
        </p>
      </div>
      <div className="mt-3">
        {canEdit ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={onEdit}
          >
            Edit
          </Button>
        ) : null}
      </div>
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
    </div>
  );
}
