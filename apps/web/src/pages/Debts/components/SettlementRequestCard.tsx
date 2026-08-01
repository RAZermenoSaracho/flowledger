import type { ReactNode } from "react";
import type { SettlementRequest } from "../../../types/debts.types";
import { formatMoney } from "../../../utils/currency";

export function SettlementRequestCard({
  request,
  isHighlighted,
  selectable,
  isSelected,
  onSelectedChange,
  actions
}: {
  request: SettlementRequest;
  isHighlighted?: boolean;
  selectable?: boolean;
  isSelected?: boolean;
  onSelectedChange?: () => void;
  actions?: ReactNode;
}) {
  const debt = request.sharedExpenseParticipant;

  return (
    <div
      id={`settlement-${request.id}`}
      className={`rounded-md border p-3 transition ${
        isHighlighted
          ? "border-pine bg-mint dark:border-emerald-500 dark:bg-emerald-950"
          : "border-slate-200 dark:border-slate-800"
      }`}
    >
      <div className="flex flex-col justify-between gap-2 sm:flex-row">
        <div className="flex gap-3">
          {selectable ? (
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300 text-pine focus:ring-mint dark:border-slate-700"
              checked={Boolean(isSelected)}
              onChange={onSelectedChange}
              aria-label={`Select ${debt?.sharedExpense.title ?? "settlement request"}`}
            />
          ) : null}
          <div>
            <p className="font-semibold">
              {debt?.sharedExpense.title ?? "Settlement request"}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {request.debtor?.name ?? "Debtor"} requested{" "}
              {formatMoney(request.amount, debt?.currency ?? "USD")}
            </p>
          </div>
        </div>
        <p className="text-sm font-semibold">{request.status}</p>
      </div>
      {request.note ? (
        <p className="mt-2 rounded-md bg-slate-50 p-2 text-sm dark:bg-slate-950">
          {request.note}
        </p>
      ) : null}
      {actions ? <div className="mt-3">{actions}</div> : null}
    </div>
  );
}
