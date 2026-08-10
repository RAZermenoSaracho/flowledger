import { ACCOUNT_TYPES } from "@flowledger/shared";
import type {
  GroupableField,
  SearchFieldConfig,
  SortableField
} from "../../../utils/searchDomain";

/**
 * Every filterable field on the Account model, plus one virtual field
 * ("source") that isn't a real column — apps/api's accounts read.service.ts
 * recognizes it by name wherever it appears in the `where` tree and expands
 * it into the real `providerAccounts` exists/notExists condition it means.
 */
export function buildAccountSearchFields(): SearchFieldConfig[] {
  return [
    { name: "name", label: "Name", type: "string" },
    { name: "identifier", label: "Identifier", type: "string" },
    { name: "currency", label: "Currency", type: "string" },
    { name: "initialBalance", label: "Initial balance", type: "number" },
    {
      name: "type",
      label: "Type",
      type: "enum",
      options: ACCOUNT_TYPES.map((type) => ({
        label: type.replace("_", " "),
        value: type
      }))
    },
    { name: "createdAt", label: "Created at", type: "date" },
    { name: "updatedAt", label: "Updated at", type: "date" },
    { name: "isArchived", label: "Archived", type: "boolean" },
    {
      // Not a real Account column — see file header.
      name: "source",
      label: "Source",
      type: "enum",
      options: [
        { label: "Manual", value: "manual" },
        { label: "Synced", value: "synced" }
      ]
    }
  ];
}

/** Fields `<SearchBar>`'s "Group by" picker offers on the Accounts page. */
export const ACCOUNT_GROUPABLE_FIELDS: GroupableField[] = [
  { name: "type", label: "Type" },
  { name: "source", label: "Source" }
];

/** Fields `<SearchBar>`'s "Sort by" picker offers on the Accounts page. */
export const ACCOUNT_SORTABLE_FIELDS: SortableField[] = [
  { name: "name", label: "Name" },
  { name: "createdAt", label: "Created date" },
  { name: "updatedAt", label: "Updated date" }
];

/** Field the Accounts page's quick-search box targets. */
export const ACCOUNT_DEFAULT_SEARCH_FIELD = "name";
