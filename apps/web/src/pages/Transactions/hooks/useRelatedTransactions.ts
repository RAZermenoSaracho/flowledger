import { useMemo, useState } from "react";
import { hasConditionOn, type WhereNode } from "../../../utils/searchDomain";
import type { SearchBarQuery } from "../../../components/SearchBar";
import * as transactionsClient from "../../../services/transactions.client";
import type { RelatedTransactionsScope } from "../../../types/transactions.types";
import { usePagination } from "../../../hooks/usePagination";

/** Default window size of a Related transactions tab. */
const RELATED_TRANSACTIONS_DEFAULT_LIMIT = 20;

const DEFAULT_SORT = [{ field: "date", direction: "desc" as const }];

/**
 * Server-paginated transactions of one account or group. The scope condition is always AND-ed with the SearchBar's
 * `where`, so user filters can only narrow it; with `scope.includeTransfersIn`, or a `scope.transfersInWith` condition in
 * the domain, an account scope also matches transfers into the account. The sort defaults to date desc. Previous window rows stay visible while
 * the next window loads.
 */
export function useRelatedTransactions(scope: RelatedTransactionsScope) {
  const [search, setSearch] = useState<SearchBarQuery>({});
  const { field, value, transfersInWith } = scope;
  const includeTransfersIn =
    field === "accountId" &&
    (!!scope.includeTransfersIn ||
      (!!transfersInWith &&
        !!search.domain &&
        hasConditionOn(search.domain, transfersInWith)));
  const where = useMemo(() => {
    const scopeCondition: WhereNode = { field, op: "=", value };
    const base: WhereNode = includeTransfersIn
      ? {
          or: [scopeCondition, { field: "transferToAccountId", op: "=", value }]
        }
      : scopeCondition;
    return search.where ? { and: [base, search.where] } : base;
  }, [field, value, includeTransfersIn, search.where]);
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
    search,
    setSearch,
    rows: list.items,
    isLoading: list.isLoading,
    error: list.error ? "Could not load transactions." : null
  };
}
