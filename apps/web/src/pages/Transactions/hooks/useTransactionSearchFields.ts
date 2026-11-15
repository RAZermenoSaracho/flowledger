import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useCurrenciesQuery } from "../../../components/CurrencySelect";
import { listAccounts } from "../../../services/accounts.client";
import * as categoriesClient from "../../../services/categories.client";
import { listGroups } from "../../../services/groups.client";
import { buildTransactionSearchFields } from "../utils/transactionSearchFields";

/**
 * The full transaction SearchBar field list (every scalar field, with account/category/group/currency pickers), shared
 * by the Transactions page and the account/group Transactions tabs. Option lists come from the complete account,
 * category (all scopes), group and currency lists, never from current results, so a picker always offers every value.
 * The result is memoized on the query data: SearchBar re-fires `onQueryChange` whenever `fields` changes identity.
 */
export function useTransactionSearchFields() {
  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => (await listAccounts()).accounts
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories", "all"],
    queryFn: async () =>
      (await categoriesClient.listCategories({ scope: "all" })).categories
  });
  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: async () => (await listGroups()).groups
  });
  const currenciesQuery = useCurrenciesQuery();

  return useMemo(
    () =>
      buildTransactionSearchFields({
        accounts: accountsQuery.data ?? [],
        categories: categoriesQuery.data ?? [],
        groups: groupsQuery.data ?? [],
        currencyOptions: [
          ...(currenciesQuery.data?.fiat ?? []),
          ...(currenciesQuery.data?.crypto ?? [])
        ].map((currency) => currency.code)
      }),
    [
      accountsQuery.data,
      categoriesQuery.data,
      groupsQuery.data,
      currenciesQuery.data
    ]
  );
}
