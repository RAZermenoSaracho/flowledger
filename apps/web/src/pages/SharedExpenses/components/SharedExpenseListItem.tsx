import { Link } from "react-router-dom";
import { RecordCard } from "../../../components/RecordCard";
import { routes } from "../../../constants/routes";
import type { SharedExpense } from "../../../types/sharedExpenses.types";
import { formatMoney } from "../../../utils/currency";
import { splitDirectionLabel } from "../utils/sharedExpenseDisplay";

/** One row in the shared expenses list, showing split direction and participant status; the whole card links to the Shared Expense view. */
export function SharedExpenseListItem({
  sharedExpense,
  isHighlighted,
  highlightedParticipantId,
  currentUserId
}: {
  sharedExpense: SharedExpense;
  isHighlighted: boolean;
  highlightedParticipantId: string | null;
  currentUserId: string | undefined;
}) {
  return (
    <Link to={routes.sharedExpense(sharedExpense.id)} className="block min-w-0">
      <RecordCard
        className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800"
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
              {formatMoney(participant.paidAmount, participant.currency)}{" "}
              settled of{" "}
              {formatMoney(participant.shareAmount, participant.currency)}
            </div>
          ))}
        </div>
      </RecordCard>
    </Link>
  );
}
