import { useMemo } from "react";
import { Card } from "../../../components/Card";
import { PageHeader } from "../../../components/PageHeader";
import { SearchBar, type SearchBarQuery } from "../../../components/SearchBar";
import {
  createConditionWithValue,
  createEmptyGroup
} from "../../../utils/searchDomain";
import type { Account } from "../../../types/accounts.types";
import type { Category } from "../../../types/categories.types";
import {
  buildImportedTransactionSearchFields,
  IMPORTED_TRANSACTION_DEFAULT_SEARCH_FIELD
} from "../utils/importedTransactionSearchFields";

/** Search/filter controls for the imported-transactions review list. */
export function ImportedTransactionsFiltersCard({
  resetKey,
  initialStatus,
  onQueryChange,
  accounts,
  categories,
  providerAccountOptions
}: {
  /** Changing this remounts <SearchBar>, re-reading `initialStatus` fresh — see TransactionsPage's `importedSearchBarResetKey`. */
  resetKey: number;
  initialStatus: string | null;
  onQueryChange: (query: SearchBarQuery) => void;
  accounts: Account[];
  categories: Category[];
  providerAccountOptions: { id: string; label: string }[];
}) {
  // Memoized: SearchBar's own `query` useMemo depends on `fields` by
  // reference, and its onQueryChange effect fires whenever `query`
  // changes — a fresh `fields` array/objects on every render (as a plain
  // function call here would produce) makes that effect fire every
  // render unconditionally, which sets state in the parent, which
  // re-renders this component, which built a fresh `fields` again: an
  // infinite render loop, not just wasted work.
  const fields = useMemo(
    () =>
      buildImportedTransactionSearchFields({
        accounts,
        categories,
        providerAccountOptions
      }),
    [accounts, categories, providerAccountOptions]
  );
  const initialDomain = initialStatus
    ? {
        ...createEmptyGroup("and"),
        children: [createConditionWithValue("status", "=", initialStatus)]
      }
    : undefined;

  return (
    <Card>
      <PageHeader title="Imported transactions">
        <SearchBar
          key={resetKey}
          fields={fields}
          defaultSearchField={IMPORTED_TRANSACTION_DEFAULT_SEARCH_FIELD}
          initialDomain={initialDomain}
          placeholder="Search imported transactions"
          onQueryChange={onQueryChange}
        />
      </PageHeader>
    </Card>
  );
}
