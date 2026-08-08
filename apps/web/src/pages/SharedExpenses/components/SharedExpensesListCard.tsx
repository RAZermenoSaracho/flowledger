import { SHARED_EXPENSE_STATUSES } from "@flowledger/shared";
import { Card } from "../../../components/Card";
import {
  groupByFields,
  SearchComponent
} from "../../../components/SearchComponent";
import type { SearchGroupByDef } from "../../../components/SearchComponent";
import type { SharedExpenseSortBy } from "../../../services/sharedExpenses.client";
import type { SharedExpense } from "../../../types/sharedExpenses.types";
import { SharedExpenseListItem } from "./SharedExpenseListItem";

/** Group-by options for the shared expenses list. */
export const sharedExpenseGroupByDefs: SearchGroupByDef[] = [
  { id: "status", label: "Status" }
];

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

/** Search/filter/group/sort controls and list container for shared expenses. */
export function SharedExpensesListCard({
  search,
  onSearchChange,
  statusFilterValues,
  onStatusFilterValuesChange,
  groupBys,
  onGroupBysChange,
  sortBy,
  sortDirection,
  onSortByChange,
  onSortDirectionChange,
  groupedSharedExpenses,
  visibleCount,
  highlightedSharedExpenseId,
  highlightedParticipantId,
  currentUserId,
  onEdit
}: {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilterValues: string[];
  onStatusFilterValuesChange: (values: string[]) => void;
  groupBys: string[];
  onGroupBysChange: (values: string[]) => void;
  sortBy: SharedExpenseSortBy;
  sortDirection: "asc" | "desc";
  onSortByChange: (value: SharedExpenseSortBy) => void;
  onSortDirectionChange: (value: "asc" | "desc") => void;
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
      <h2 className="text-lg font-semibold">Shared expenses</h2>
      <div className="mt-4">
        <SearchComponent
          searchValue={search}
          searchPlaceholder="Search shared expenses"
          onSearchChange={onSearchChange}
          facets={[
            {
              id: "status",
              label: "Status",
              options: SHARED_EXPENSE_STATUSES.map((item) => ({
                label: item,
                value: item
              }))
            }
          ]}
          activeFacetValues={{ status: statusFilterValues }}
          onFacetValuesChange={(facetId, values) =>
            facetId === "status" && onStatusFilterValuesChange(values)
          }
          groupBys={sharedExpenseGroupByDefs}
          activeGroupBys={groupBys}
          onGroupBysChange={onGroupBysChange}
          sort={{
            value: sortBy,
            direction: sortDirection,
            onChange: (value) => onSortByChange(value as SharedExpenseSortBy),
            onDirectionChange: onSortDirectionChange,
            options: [
              { label: "Created date", value: "createdAt" },
              { label: "Updated date", value: "updatedAt" },
              { label: "Title", value: "title" },
              { label: "Total amount", value: "totalAmount" },
              { label: "Status", value: "status" }
            ]
          }}
        />
      </div>
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
