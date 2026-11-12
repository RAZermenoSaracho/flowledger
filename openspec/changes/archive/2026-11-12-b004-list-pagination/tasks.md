# Tasks

## 1. DataSieve integration

- [x] 1.1 Add a shared offset/cursor pagination Zod schema (`packages/shared`) and use it in `createSieve`. Add `maxPageSize` (clamp) and the `id` tie-breaker. Verify: `db/tests/sieve.test.ts` covers invalid page/pageSize → 400, clamp, tie-breaker appended once in the last sort direction, untouched unpaginated queries. Shared schema test.
- [x] 1.2 Pass `MAX_TRANSACTION_PAGE_SIZE` from the transactions and imported sieves. Keep `boundedPagination`'s default. Verify: existing transactions/v1/MCP tests pass.

## 2. Imported list

- [x] 2.1 `resolveImportedTransactionIds` takes optional pagination and returns `{ ids, total }`. `listImportedTransactions` forwards `input.pagination` and hydrates only the page. Batch selection passes none. Verify: unit tests for both paths, plus an integration test (two users, 3 pages, total, out-of-range, select-all-filtered across pages).

## 3. Web

- [x] 3.1 `components/Pagination.tsx` and `hooks/usePagination.ts` with tests (labels, disabled states, page-size change, reset on key change, clamp).
- [x] 3.2 Transactions page: page through `usePagination` (default 50), server total, `Pagination` under the list. Verify: page test with msw asserting the requested pagination, reset on search change, and total label.
- [x] 3.3 Imported tab: request pages of 50, render `Pagination`, keep select-all-filtered. Verify: hook/page tests.
- [x] 3.4 Replace `AccountTransactionsTab`'s inline pager with the shared related-transactions list (st006 task 7.1).

## 4. Docs and validation

- [x] 4.1 `docs/PUBLIC_API.md` notes optional pagination on imported transactions in the web API only. Log deferred lists in `docs/KNOWN_ISSUES.md`.
- [x] 4.2 Typecheck, lint, tests, build, `openspec validate b004-list-pagination --strict`. Staging check: paged Transactions and Imported lists.
