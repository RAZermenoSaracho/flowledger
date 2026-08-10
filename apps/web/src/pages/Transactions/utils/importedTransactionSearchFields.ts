import { PROVIDER_IMPORTED_TRANSACTION_STATUSES } from "@flowledger/shared";
import type { Account } from "../../../types/accounts.types";
import type { Category } from "../../../types/categories.types";
import type { SearchFieldConfig } from "../../../utils/searchDomain";

/**
 * Every filterable field for the imported-transactions review list, plus
 * one virtual field ("search") that isn't a real column — apps/api's
 * transactions read.service.ts recognizes it by name wherever it appears
 * in the `where` tree and expands it into the same multi-field (name/
 * provider/category/linked-account/institution/raw-metadata) search the
 * old filter form used. Its operator is fixed to "ilike" ("contains")
 * since the backend's expansion ignores whatever operator is sent — every
 * other operator FilterBuilder could offer would be misleading here, since
 * none of them change the actual (always-substring) matching behavior.
 */
export function buildImportedTransactionSearchFields({
  accounts,
  categories,
  providerAccountOptions
}: {
  accounts: Account[];
  categories: Category[];
  providerAccountOptions: { id: string; label: string }[];
}): SearchFieldConfig[] {
  return [
    { name: "search", label: "Search", type: "string", ops: ["ilike"] },
    {
      name: "status",
      label: "Status",
      type: "enum",
      options: PROVIDER_IMPORTED_TRANSACTION_STATUSES.map((status) => ({
        label: status,
        value: status
      }))
    },
    { name: "provider", label: "Provider", type: "string" },
    {
      // Dot-path to the linked FlowLedger account — a real to-one relation
      // DSQL can traverse directly, not a virtual field.
      name: "providerAccount.accountId",
      label: "Linked account",
      type: "enum",
      options: accounts.map((account) => ({
        label: account.name,
        value: account.id
      }))
    },
    {
      name: "providerAccountLink",
      label: "Provider account",
      type: "enum",
      options: providerAccountOptions.map((option) => ({
        label: option.label,
        value: option.id
      })),
      expandsToFields: ["providerAccountRefId", "providerAccountId"]
    },
    {
      name: "categoryId",
      label: "Category",
      type: "enum",
      options: categories.map((category) => ({
        label: category.name,
        value: category.id
      }))
    },
    { name: "transactionDate", label: "Date", type: "date" },
    { name: "amount", label: "Amount", type: "number" }
  ];
}

/** Field the Imported Transactions page's quick-search box targets. */
export const IMPORTED_TRANSACTION_DEFAULT_SEARCH_FIELD = "search";
