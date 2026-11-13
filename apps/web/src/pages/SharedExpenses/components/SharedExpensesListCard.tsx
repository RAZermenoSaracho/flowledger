import { useNavigate } from "react-router-dom";
import { AddRecordButton } from "../../../components/AddRecordButton";
import { ListView } from "../../../components/ListView";
import { SearchBar, type SearchBarQuery } from "../../../components/SearchBar";
import { routes } from "../../../constants/routes";
import type { ListGroup } from "../../../types/common.types";
import type { SharedExpense } from "../../../types/sharedExpenses.types";
import {
  buildSharedExpenseSearchFields,
  SHARED_EXPENSE_DEFAULT_SEARCH_FIELD,
  SHARED_EXPENSE_GROUPABLE_FIELDS,
  SHARED_EXPENSE_SORTABLE_FIELDS
} from "../utils/sharedExpenseSearchFields";
import { SharedExpenseListItem } from "./SharedExpenseListItem";

/** Derives the group key/label for a shared expense under a chosen group-by field. */
export function sharedExpenseGroupKey(
  sharedExpense: SharedExpense,
  groupById: string
) {
  if (groupById === "status") {
    return { key: sharedExpense.status, label: sharedExpense.status };
  }
  return { key: "", label: "" };
}

const sharedExpenseSearchFields = buildSharedExpenseSearchFields();

/** Search/filter/group/sort controls and list container for shared expenses. "Add shared expense" opens a new-transaction draft on its Sharing tab. */
export function SharedExpensesListCard({
  onQueryChange,
  sharedExpenses,
  groupedSharedExpenses,
  isLoading,
  error,
  highlightedSharedExpenseId,
  highlightedParticipantId,
  currentUserId
}: {
  onQueryChange: (query: SearchBarQuery) => void;
  sharedExpenses: SharedExpense[];
  groupedSharedExpenses?: ListGroup<SharedExpense>[];
  isLoading?: boolean;
  error?: string | null;
  highlightedSharedExpenseId: string | null;
  highlightedParticipantId: string | null;
  currentUserId: string | undefined;
}) {
  const navigate = useNavigate();

  return (
    <ListView
      title="Shared expenses"
      subtitle="Open a shared expense to edit it. To share an existing transaction, open it and use its Sharing tab."
      actions={
        <AddRecordButton
          label="shared expense"
          onClick={() =>
            navigate(`${routes.newTransaction}?shared=1&tab=sharing`, {
              state: { from: `${routes.debts}?tab=sharedExpenses` }
            })
          }
        />
      }
      toolbar={
        <SearchBar
          fields={sharedExpenseSearchFields}
          groupableFields={SHARED_EXPENSE_GROUPABLE_FIELDS}
          sortableFields={SHARED_EXPENSE_SORTABLE_FIELDS}
          defaultSearchField={SHARED_EXPENSE_DEFAULT_SEARCH_FIELD}
          initialSort={{ field: "createdAt", direction: "desc" }}
          placeholder="Search shared expenses"
          onQueryChange={onQueryChange}
        />
      }
      items={sharedExpenses}
      groups={groupedSharedExpenses}
      rowKey={(sharedExpense) => sharedExpense.id}
      renderItem={(sharedExpense) => (
        <SharedExpenseListItem
          sharedExpense={sharedExpense}
          isHighlighted={highlightedSharedExpenseId === sharedExpense.id}
          highlightedParticipantId={highlightedParticipantId}
          currentUserId={currentUserId}
        />
      )}
      isLoading={isLoading}
      error={error}
      emptyText="No shared expenses found."
    />
  );
}
