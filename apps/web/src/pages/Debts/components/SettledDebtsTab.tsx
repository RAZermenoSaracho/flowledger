import { ListView } from "../../../components/ListView";
import { SearchBar, type SearchBarQuery } from "../../../components/SearchBar";
import type { Debt } from "../../../types/debts.types";
import {
  SETTLED_DEBT_DEFAULT_SEARCH_FIELD,
  settledDebtSearchFields
} from "../utils/debtSearchFields";
import { DebtSummaryCard } from "./DebtSummaryCard";

/** Tab listing fully settled debts. */
export function SettledDebtsTab({
  settledDebts,
  visibleSettledDebts,
  onSettledQueryChange,
  viewerUserId,
  highlightedDebtId,
  isLoading,
  error
}: {
  settledDebts: Debt[];
  visibleSettledDebts: Debt[];
  onSettledQueryChange: (query: SearchBarQuery) => void;
  viewerUserId?: string;
  highlightedDebtId?: string | null;
  isLoading?: boolean;
  error?: string | null;
}) {
  return (
    <ListView
      title="Settled history"
      subtitle="Completed shared-expense debts."
      toolbar={
        <SearchBar
          fields={settledDebtSearchFields}
          defaultSearchField={SETTLED_DEBT_DEFAULT_SEARCH_FIELD}
          placeholder="Search settled debts"
          onQueryChange={onSettledQueryChange}
        />
      }
      items={visibleSettledDebts}
      isLoading={isLoading}
      error={error}
      total={settledDebts.length}
      rowKey={(debt) => debt.id}
      emptyText={
        settledDebts.length === 0
          ? "No settled debts yet."
          : "No settled debts match your search."
      }
      renderItem={(debt) => (
        <DebtSummaryCard
          debt={debt}
          viewerUserId={viewerUserId}
          isHighlighted={highlightedDebtId === debt.id}
        />
      )}
    />
  );
}
