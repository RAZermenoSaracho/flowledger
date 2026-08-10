import { SHARED_EXPENSE_STATUSES } from "@flowledger/shared";
import type {
  GroupableField,
  SearchFieldConfig,
  SortableField
} from "../../../utils/searchDomain";

/** Every filterable field on the SharedExpense model. */
export function buildSharedExpenseSearchFields(): SearchFieldConfig[] {
  return [
    { name: "title", label: "Title", type: "string" },
    { name: "totalAmount", label: "Total amount", type: "number" },
    {
      name: "status",
      label: "Status",
      type: "enum",
      options: SHARED_EXPENSE_STATUSES.map((status) => ({
        label: status,
        value: status
      }))
    },
    { name: "createdAt", label: "Created at", type: "date" },
    { name: "updatedAt", label: "Updated at", type: "date" }
  ];
}

/** Fields `<SearchBar>`'s "Group by" picker offers on the Shared Expenses page. */
export const SHARED_EXPENSE_GROUPABLE_FIELDS: GroupableField[] = [
  { name: "status", label: "Status" }
];

/** Fields `<SearchBar>`'s "Sort by" picker offers on the Shared Expenses page. */
export const SHARED_EXPENSE_SORTABLE_FIELDS: SortableField[] = [
  { name: "createdAt", label: "Created date" },
  { name: "updatedAt", label: "Updated date" },
  { name: "title", label: "Title" },
  { name: "totalAmount", label: "Total amount" },
  { name: "status", label: "Status" }
];

/** Field the Shared Expenses page's quick-search box targets. */
export const SHARED_EXPENSE_DEFAULT_SEARCH_FIELD = "title";
