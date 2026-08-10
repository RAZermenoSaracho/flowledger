import { AddRecordButton } from "../../../components/AddRecordButton";
import { Card } from "../../../components/Card";
import { PageHeader } from "../../../components/PageHeader";
import { groupByFields } from "../../../components/SearchComponent";
import { SearchBar, type SearchBarQuery } from "../../../components/SearchBar";
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

export { groupByFields };

const sharedExpenseSearchFields = buildSharedExpenseSearchFields();

/** Search/filter/group/sort controls and list container for shared expenses. */
export function SharedExpensesListCard({
  onQueryChange,
  onAddSharedExpense,
  groupedSharedExpenses,
  visibleCount,
  highlightedSharedExpenseId,
  highlightedParticipantId,
  currentUserId,
  onEdit
}: {
  onQueryChange: (query: SearchBarQuery) => void;
  onAddSharedExpense: () => void;
  groupedSharedExpenses: {
    key: string;
    label: string;
    items: SharedExpense[];
  }[];
  visibleCount: number;
  highlightedSharedExpenseId: string | null;
  highlightedParticipantId: string | null;
  currentUserId: string | undefined;
  onEdit: (sharedExpense: SharedExpense) => void;
}) {
  return (
    <Card>
      <PageHeader
        title="Shared expenses"
        action={
          <AddRecordButton
            label="shared expense"
            onClick={onAddSharedExpense}
          />
        }
      >
        <SearchBar
          fields={sharedExpenseSearchFields}
          groupableFields={SHARED_EXPENSE_GROUPABLE_FIELDS}
          sortableFields={SHARED_EXPENSE_SORTABLE_FIELDS}
          defaultSearchField={SHARED_EXPENSE_DEFAULT_SEARCH_FIELD}
          initialSort={{ field: "createdAt", direction: "desc" }}
          placeholder="Search shared expenses"
          onQueryChange={onQueryChange}
        />
      </PageHeader>
      <div className="mt-4 grid gap-4">
        {groupedSharedExpenses.map((section) => (
          <div key={section.key || "all"} className="grid gap-3">
            {section.label ? (
              <h3 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">
                {section.label}
              </h3>
            ) : null}
            <div className="grid gap-3">
              {section.items.map((sharedExpense) => (
                <SharedExpenseListItem
                  key={sharedExpense.id}
                  sharedExpense={sharedExpense}
                  isHighlighted={
                    highlightedSharedExpenseId === sharedExpense.id
                  }
                  highlightedParticipantId={highlightedParticipantId}
                  canEdit={sharedExpense.ownerUserId === currentUserId}
                  onEdit={() => onEdit(sharedExpense)}
                />
              ))}
            </div>
          </div>
        ))}
        {visibleCount === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No shared expenses found.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
