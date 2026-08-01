import { Card } from "../../../components/Card";
import { SearchComponent } from "../../../components/SearchComponent";
import type { Debt } from "../../../types/api";
import { DebtSummaryCard } from "./DebtSummaryCard";
import { EmptyState } from "./EmptyState";

export function SettledDebtsTab({
  settledDebts,
  visibleSettledDebts,
  settledSearch,
  onSettledSearchChange,
  viewerUserId,
  highlightedDebtId
}: {
  settledDebts: Debt[];
  visibleSettledDebts: Debt[];
  settledSearch: string;
  onSettledSearchChange: (value: string) => void;
  viewerUserId?: string;
  highlightedDebtId?: string | null;
}) {
  return (
    <Card>
      <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold">Settled history</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Completed shared-expense debts.
          </p>
        </div>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          {visibleSettledDebts.length} of {settledDebts.length}
        </p>
      </div>
      <div className="mt-4">
        <SearchComponent
          searchValue={settledSearch}
          searchPlaceholder="Search settled debts"
          onSearchChange={onSettledSearchChange}
        />
      </div>
      <div className="mt-4 grid gap-3">
        {settledDebts.length === 0 ? (
          <EmptyState>No settled debts yet.</EmptyState>
        ) : visibleSettledDebts.length === 0 ? (
          <EmptyState>No settled debts match your search.</EmptyState>
        ) : (
          visibleSettledDebts.map((debt) => (
            <DebtSummaryCard
              key={debt.id}
              debt={debt}
              viewerUserId={viewerUserId}
              isHighlighted={highlightedDebtId === debt.id}
            />
          ))
        )}
      </div>
    </Card>
  );
}
