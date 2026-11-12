import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { SearchBarQuery } from "../components/SearchBar";
import * as transactionsClient from "../services/transactions.client";
import type { RelatedTransactionsScope } from "../types/transactions.types";
import { usePagination } from "./usePagination";

/** Transactions per page in a Related transactions tab. */
const RELATED_TRANSACTIONS_PAGE_SIZE = 20;

const DEFAULT_SORT = [{ field: "date", direction: "desc" as const }];

/**
 * Server-paginated transactions of one account or group. The SearchBar's `where` is AND-ed with the
 * scope condition; the sort defaults to date desc.
 * Previous page rows stay visible while the next page loads.
 */
export function useRelatedTransactions(scope: RelatedTransactionsScope) {
  const [search, setSearch] = useState<SearchBarQuery>({});
  const where = useMemo(() => {
    const scopeCondition = { field: scope.field, op: "=" as const, value: scope.value };
    return search.where ? { and: [scopeCondition, search.where] } : scopeCondition;
  }, [scope.field, scope.value, search.where]);
  const sort = search.sort?.length ? search.sort : DEFAULT_SORT;

  const paging = usePagination({
    resetKey: JSON.stringify({ where, sort }),
    pageSize: RELATED_TRANSACTIONS_PAGE_SIZE
  });
  const query = useQuery({
    queryKey: ["transactions", "related", where, sort, paging.page],
    placeholderData: keepPreviousData,
    queryFn: () =>
      transactionsClient.listTransactions({ where, sort, pagination: paging.pagination })
  });
  paging.syncPageCount(query.data?.meta.pageCount);

  return {
    paging,
    setSearch,
    rows: query.data?.data ?? [],
    meta: query.data?.meta ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ? "Could not load transactions." : null
  };
}
