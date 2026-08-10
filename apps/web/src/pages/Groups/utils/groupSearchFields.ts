import type {
  GroupableField,
  SearchFieldConfig,
  SortableField
} from "../../../utils/searchDomain";

/** Every filterable field on the Group model. */
export function buildGroupSearchFields(): SearchFieldConfig[] {
  return [
    { name: "name", label: "Name", type: "string" },
    { name: "description", label: "Description", type: "string" },
    { name: "createdAt", label: "Created at", type: "date" },
    { name: "updatedAt", label: "Updated at", type: "date" },
    { name: "isArchived", label: "Archived", type: "boolean" }
  ];
}

/** Fields `<SearchBar>`'s "Group by" picker offers on the Groups page — none, currently. */
export const GROUP_GROUPABLE_FIELDS: GroupableField[] = [];

/** Fields `<SearchBar>`'s "Sort by" picker offers on the Groups page. */
export const GROUP_SORTABLE_FIELDS: SortableField[] = [
  { name: "name", label: "Name" },
  { name: "createdAt", label: "Created date" },
  { name: "updatedAt", label: "Updated date" }
];

/** Field the Groups page's quick-search box targets. */
export const GROUP_DEFAULT_SEARCH_FIELD = "name";
