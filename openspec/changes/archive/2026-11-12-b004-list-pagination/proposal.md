# Proposal

## Why

The web Transactions page loads up to 10,000 rows in one request and renders them all. The Imported Transactions tab loads every matching row with no bound. Account Related transactions pages correctly but has its own pager, and the Group view shows only the latest 25 of the caller's transactions with no way to see more. DataSieve already runs filter, sort, count and page in one database round trip, but FlowLedger's integration (`createSieve`) does not bound page sizes or guarantee a stable order, so every caller re-implements both.

## What Changes

- FlowLedger's DataSieve integration validates offset pagination (integer page ≥ 1, integer page size ≥ 1), clamps the page size to a per-resource maximum, and appends an `id` tie-breaker to any paginated sort that lacks one. Authorization stays in each service's `where` scope, applied before pagination.
- The web Transactions list is server-paginated (default 50 per page, 25/50/100 selectable). Search, filters and sort run in the backend over the full dataset and reset the page to 1. The total comes from the server. Group-by buckets apply to the current page.
- The Imported Transactions list accepts optional `pagination` in its query and returns that page, with `total` still the full match count. Without `pagination`, the response is unchanged, so `/v1` and MCP keep their contracts. "Select all filtered" batch actions still operate on every match.
- One reusable web `Pagination` control (Previous/Next, "Page X of Y", result count, optional page size) and one `usePagination` hook (page state, reset on filter change, clamp when the page falls out of range) replace the Account tab's inline pager.
- One shared related-transactions list backs Account › Related transactions and the new Group › Related transactions tab (changes `st006-account-form-view` and `st024-group-form-view`).
- No API endpoint, response shape, schema or migration change. No datasieve package release. The bound and tie-breaker live in FlowLedger's integration layer, and upstreaming them is a follow-up.

## Capabilities

### New Capabilities
- `list-pagination`: bounded, stable, server-side pagination for transaction list views, and the shared pagination control.

### Modified Capabilities

None. `search-filter-chips` is unchanged: chip changes simply reset the page.

## Impact

- `apps/api`: `db/sieve.ts` (pagination validation, clamp, tie-breaker), `transactions` imported-list service and id resolver, and their tests. `packages/shared`: a pagination schema.
- `apps/web`: `components/Pagination.tsx`, `hooks/usePagination.ts`, the shared related-transactions list, `pages/Transactions` (list page, imported workflow) and the client, plus their tests.
- `/v1` and MCP: unchanged contracts, covered by their existing tests.
- Deferred and documented: Shared expenses, Debts and the Groups overview remain unpaginated. They are bounded by the user's own data, and Debts needs a query rewrite. Categories, Accounts and Notifications (capped at 50) are small reference lists.
