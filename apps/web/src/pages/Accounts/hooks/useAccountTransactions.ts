import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import * as transactionsClient from "../../../services/transactions.client";

/** Transactions shown per page in an account's Related transactions tab. */
export const ACCOUNT_TRANSACTIONS_PAGE_SIZE = 20;

/**
 * Server-paginated transactions of one account, newest first (date desc, id desc as a stable tiebreaker).
 * Previous page rows stay visible while the next page loads.
 */
export function useAccountTransactions(accountId: string) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["transactions", "account", accountId, page],
    placeholderData: keepPreviousData,
    queryFn: () =>
      transactionsClient.listTransactions({
        where: { field: "accountId", op: "=", value: accountId },
        sort: [
          { field: "date", direction: "desc" },
          { field: "id", direction: "desc" }
        ],
        pagination: {
          kind: "offset",
          page,
          pageSize: ACCOUNT_TRANSACTIONS_PAGE_SIZE
        }
      })
  });

  return {
    page,
    rows: query.data?.data ?? [],
    hasNext: query.data?.meta.hasNext ?? false,
    hasPrevious: page > 1,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ? "Could not load transactions." : null,
    goNext: () => setPage((current) => current + 1),
    goPrevious: () => setPage((current) => Math.max(1, current - 1))
  };
}
