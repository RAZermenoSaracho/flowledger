import { CATEGORY_TYPES } from "@flowledger/shared";
import type {
  GroupableField,
  SearchFieldConfig,
  SortableField
} from "../../../utils/searchDomain";

/** Every filterable field on the Category model. */
export function buildCategorySearchFields(): SearchFieldConfig[] {
  return [
    { name: "name", label: "Name", type: "string" },
    {
      name: "type",
      label: "Type",
      type: "enum",
      options: CATEGORY_TYPES.map((type) => ({ label: type, value: type }))
    },
    { name: "createdAt", label: "Created at", type: "date" },
    { name: "updatedAt", label: "Updated at", type: "date" },
    { name: "isArchived", label: "Archived", type: "boolean" }
  ];
}

/** Fields `<SearchBar>`'s "Group by" picker offers on the Categories page. */
export const CATEGORY_GROUPABLE_FIELDS: GroupableField[] = [
  { name: "type", label: "Type" }
];

/** Fields `<SearchBar>`'s "Sort by" picker offers on the Categories page. */
export const CATEGORY_SORTABLE_FIELDS: SortableField[] = [
  { name: "name", label: "Name" },
  { name: "createdAt", label: "Created date" },
  { name: "updatedAt", label: "Updated date" }
];

/** Field the Categories page's quick-search box targets. */
export const CATEGORY_DEFAULT_SEARCH_FIELD = "name";
