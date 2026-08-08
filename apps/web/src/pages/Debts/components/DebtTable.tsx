import type { ReactNode } from "react";
import { Button } from "../../../components/Button";
import type { Debt } from "../../../types/debts.types";
import { formatMoney } from "../../../utils/currency";
import { debtDescription, debtTitle, statusLabel } from "../utils/debtDisplay";
import { EmptyState } from "./EmptyState";

/** Table listing debts with row selection and highlight support. */
export function DebtTable({
  title,
  debts,
  viewerUserId,
  selectedDebtIds,
  highlightedDebtId,
  emptyText,
  selectableDebts = debts,
  onToggleDebt,
  onSelectDebts,
  renderAction
}: {
  title: string;
  debts: Debt[];
  viewerUserId?: string;
  selectedDebtIds: Set<string>;
  highlightedDebtId?: string | null;
  emptyText: string;
  selectableDebts?: Debt[];
  onToggleDebt: (debtId: string) => void;
  onSelectDebts: (debts: Debt[], selected: boolean) => void;
  renderAction?: (debt: Debt) => ReactNode;
}) {
  const selectableIds = new Set(selectableDebts.map((debt) => debt.id));
  const allSelected =
    selectableDebts.length > 0 &&
    selectableDebts.every((debt) => selectedDebtIds.has(debt.id));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">
          {title}
        </h3>
        <Button
          type="button"
          variant="secondary"
          className="min-h-8 px-3 py-1 text-xs"
          disabled={selectableDebts.length === 0}
          onClick={() => onSelectDebts(selectableDebts, !allSelected)}
        >
          {allSelected ? "Clear Selection" : "Select All"}
        </Button>
      </div>
      {debts.length === 0 ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : (
        <div className="rounded-md border border-slate-200 dark:border-slate-800">
          <table className="block w-full text-left text-sm lg:table">
            <thead className="hidden bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950 dark:text-slate-400 lg:table-header-group">
              <tr>
                <th className="w-10 px-3 py-2 font-semibold">Select</th>
                <th className="px-3 py-2 font-semibold">Debt</th>
                <th className="w-32 px-3 py-2 text-right font-semibold">
                  Outstanding
                </th>
                <th className="w-36 px-3 py-2 font-semibold">Status</th>
                {renderAction ? (
                  <th className="w-80 px-3 py-2 font-semibold">Settlement</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="grid gap-3 p-3 lg:table-row-group lg:divide-y lg:divide-slate-100 lg:p-0 dark:lg:divide-slate-800">
              {debts.map((debt) => {
                const isSelectable = selectableIds.has(debt.id);
                return (
                  <tr
                    key={debt.id}
                    id={`debt-${debt.id}`}
                    className={`block rounded-md border transition lg:table-row lg:rounded-none lg:border-0 ${
                      highlightedDebtId === debt.id
                        ? "border-pine bg-mint dark:border-emerald-500 dark:bg-emerald-950"
                        : "border-slate-200 dark:border-slate-800"
                    }`}
                  >
                    <td className="block px-3 pt-3 align-top lg:table-cell lg:py-3">
                      <span className="mb-1 block text-xs font-semibold uppercase text-slate-500 lg:hidden dark:text-slate-400">
                        Select
                      </span>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-pine focus:ring-mint disabled:opacity-50 dark:border-slate-700"
                        checked={selectedDebtIds.has(debt.id)}
                        disabled={!isSelectable}
                        onChange={() => onToggleDebt(debt.id)}
                        aria-label={`Select ${debtTitle(debt)}`}
                      />
                    </td>
                    <td className="block px-3 py-3 align-top lg:table-cell">
                      <p className="font-semibold">{debtTitle(debt)}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {debtDescription(debt, viewerUserId)}
                      </p>
                    </td>
                    <td className="block px-3 py-2 align-top font-semibold lg:table-cell lg:py-3 lg:text-right">
                      <span className="mb-1 block text-xs font-semibold uppercase text-slate-500 lg:hidden dark:text-slate-400">
                        Outstanding
                      </span>
                      {formatMoney(debt.outstandingAmount, debt.currency)}
                    </td>
                    <td className="block px-3 py-2 align-top text-slate-500 lg:table-cell lg:py-3 dark:text-slate-400">
                      <span className="mb-1 block text-xs font-semibold uppercase text-slate-500 lg:hidden dark:text-slate-400">
                        Status
                      </span>
                      {statusLabel(debt)}
                    </td>
                    {renderAction ? (
                      <td className="block px-3 pb-3 pt-2 align-top lg:table-cell lg:py-3">
                        <span className="mb-2 block text-xs font-semibold uppercase text-slate-500 lg:hidden dark:text-slate-400">
                          Settlement
                        </span>
                        {renderAction(debt)}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
