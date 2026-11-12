# Design

## Context

DataSieve (`datasieve@0.2.0`) runs `where`, `sort` and offset pagination as one `count` plus `findMany` transaction and returns `{ data, meta: { total, page, pageSize, pageCount, hasNext, hasPrevious } }`. It rejects page or page size below 1. It has no maximum page size and no automatic tie-breaker. FlowLedger wraps it in `createSieve` (`apps/api/src/db/sieve.ts`). Services add the authorization scope as an `and` with the user's `where`, so scope always precedes paging.

## Decisions

- **Bound and order in `createSieve`, not in each service.** `createSieve(delegate, { maxPageSize })` validates `pagination` with a shared Zod schema (400 on failure), clamps offset `pageSize` and cursor `take` to `maxPageSize`, and appends `{ field: "id" }` to the sort when paginated and no `id` key exists. Transactions keep `boundedPagination` only for its no-pagination default (10,000, for unchanged legacy callers). Alternative: a datasieve release adding `maxPageSize` and `tieBreaker` engine options. Rejected for now because it requires publishing a package. This is the follow-up.
- **Offset, not cursor.** Every UI here shows numbered pages with a total, `/v1` already forbids cursor, and per-user data volumes are small. Cursor pagination has no consumer.
- **Imported list: page in the resolver, hydrate only the page.** `resolveImportedTransactionIds` takes optional pagination and returns `{ ids, total }`. Batch "select all filtered" calls it without pagination, so it still gets every id. The response shape is unchanged.
- **Web: one control, one hook.** `Pagination` renders from `meta`. `usePagination(resetKey)` owns `page`/`pageSize`, resets to 1 when `resetKey` (the serialized where and sort) changes, and exposes the DataSieve `pagination` object. It also takes the last `meta.pageCount` and moves to that page when the current page falls past it; this is the only place the clamp lives. Lists keep previous data while loading. Only the main Transactions list offers a page-size selector. Related lists use 20 rows and the imported list 50. Related lists reuse the existing `SearchBar` (name search plus the existing sortable fields) instead of a new sort control.
- **Group-by stays client-side per page.** Server-side grouping across pages is a different feature. The page header states the total.

## Risks

- Group-by buckets now cover one page, not every match. This is a visible behavior change, documented in the spec.
- Provider-account filter options on the imported tab are derived from the loaded rows (already true today for filtered results) and now from one page.
