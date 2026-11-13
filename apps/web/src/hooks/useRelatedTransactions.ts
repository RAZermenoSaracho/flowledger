import { useMemo, useState } from "react";
import type { SearchBarQuery } from "../components/SearchBar";
import * as transactionsClient from "../services/transactions.client";
import type { RelatedTransactionsScope } from "../types/transactions.types";
import { usePagination } from "./usePagination";

/** Default window size of a Related transactions tab. */
const RELATED_TRANSACTIONS_DEFAULT_LIMIT = 20;

const DEFAULT_SORT = [{ field: "date", direction: "desc" as const }];

/**
 * Server-paginated transactions of one account or group. The SearchBar's `where` is AND-ed with the
 * scope condition; the sort defaults to date desc.
 * Previous window rows stay visible while the next window loads.
 */
export function useRelatedTransactions(scope: RelatedTransactionsScope) {
  const [search, setSearch] = useState<SearchBarQuery>({});
  const where = useMemo(() => {
    const scopeCondition = {
      field: scope.field,
      op: "=" as const,
      value: scope.value
    };
    return search.where
      ? { and: [scopeCondition, search.where] }
      : scopeCondition;
  }, [scope.field, scope.value, search.where]);
  const sort = search.sort?.length ? search.sort : DEFAULT_SORT;

  const list = usePagination({
    queryKey: ["transactions", "related", where, sort],
    resetKey: JSON.stringify({ where, sort }),
    defaultLimit: RELATED_TRANSACTIONS_DEFAULT_LIMIT,
    fetchPage: async (pagination) => {
      const { data, meta } = await transactionsClient.listTransactions({
        where,
        sort,
        pagination
      });
      return { items: data, total: meta.total, hasNext: meta.hasNext };
    }
  });

  return {
    pager: list.pager,
    setSearch,
    rows: list.items,
    isLoading: list.isLoading,
    error: list.error ? "Could not load transactions." : null
  };
}
