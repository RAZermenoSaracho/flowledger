import type { Debt } from "../../../types/api";
import { formatMoney } from "../../../utils/currency";
import { debtDescription, debtTitle, statusLabel } from "../utils/debtDisplay";

export function DebtSummaryCard({
  debt,
  viewerUserId,
  isHighlighted
}: {
  debt: Debt;
  viewerUserId?: string;
  isHighlighted?: boolean;
}) {
  return (
    <div
      id={`debt-${debt.id}`}
      className={`rounded-md border p-3 transition ${
        isHighlighted
          ? "border-pine bg-mint dark:border-emerald-500 dark:bg-emerald-950"
          : "border-slate-200 dark:border-slate-800"
      }`}
    >
      <div className="flex flex-col justify-between gap-2 sm:flex-row">
        <div>
          <p className="font-semibold">{debtTitle(debt)}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {debtDescription(debt, viewerUserId)}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="font-semibold">
            {formatMoney(debt.outstandingAmount, debt.currency)}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {statusLabel(debt)}
          </p>
        </div>
      </div>
    </div>
  );
}
