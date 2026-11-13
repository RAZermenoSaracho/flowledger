# Proposal

## Why

Every web list page hand-assembles the same chrome: `PageHeader` + `AddRecordButton` + `Card` + `SearchBar`, a duplicated empty-state `<p>` (about ten copies), a duplicated grouped-section loop (Accounts, Categories, Shared Expenses, Transactions), a duplicated "title + subtitle + x of y" header (three Debts tabs), and three copies of the `useQuery` + `usePagination` + `keepPreviousData` + `syncPageCount` wiring. Loading and error states are missing on Transactions, Accounts, Categories, Groups and Shared Expenses. Pagination renders below the list, so on a 50-row page the user must scroll to the bottom to change page. Selection (select-all / clear / bulk buttons) is implemented three separate times (Imported Transactions, Pending Requests, Person debt detail). A reusable list view makes every list consistent and makes the next list cheap.

## What Changes

- New shared `ListView<T>` presentation shell: header (title, subtitle, record count, actions, optional pager), toolbar slot, card or table body, grouped sections, shared loading / error / empty states, and an optional selection bar with bulk actions. It has no model knowledge and does no data fetching. It replaces `PageHeader`, which is deleted.
- New shared `EmptyState` (promoted from `pages/Debts/components/EmptyState.tsx`, which is deleted).
- `Pagination` is rewritten in place as an Odoo-style editable-range pager: `‹ 41-80 / 312 ›`. The range is click-to-edit (type `7-26`, press Enter), Previous/Next move by the current window size. There is no page-size dropdown and no "Page X of Y". Only the window size (`limit`) is remembered per list in `localStorage`.
- **Backend (additive):** a new `{ kind: "range", offset, limit }` pagination variant, because arbitrary windows are not expressible with page/pageSize. It is implemented in the sibling `datasieve` repo (published, version bumped in `apps/api/package.json`), added to `listPaginationSchema`, and clamped in `createSieve`. Existing `offset`(page) and `cursor` kinds are unchanged.
- New hook `useListSelection` (window selection, "select all N matching", clear on query change). `usePagination` is rewritten as the single paging hook: `{offset, limit}` state, limit persistence, reset, total-shrink clamp and `useQuery` + `keepPreviousData`, collapsing the three duplicated wirings.
- `groupByFields` moves to `utils/groupByFields.ts`; the dead `components/SearchComponent.tsx` and its test are deleted. `SearchBar` and its `search-filter-chips` behavior are untouched.
- `RelatedList` stays a standalone table; it only gains an optional `headerActions` slot (top-right of its title row) where `RelatedTransactionsList` puts the shared range pager. Its six callers and tests are unchanged.
- Migrate: Transactions, Imported Transactions, Related Transactions, Accounts, Categories, Groups, Shared Expenses, the Debts tabs (Balances, Settled, Pending Requests, Awaiting Acceptance) and Group Categories. Default windows: transactions 50, imported 50, related 20.
- Pagination stays server-side only. Non-transaction lists (small, unpaginated, no counts from the API) get no pager.
- A separate, out-of-scope inventory of other frontend cleanup candidates is in [frontend-cleanup-audit.md](./frontend-cleanup-audit.md); it is not part of this change.
- No schema, migration or new-endpoint change. One dependency bump (`@razsdev/datasieve-prisma` and related packages) for the range kind.

## Capabilities

### New Capabilities
- `list-view`: the shared list shell contract: layout, composition, states, record count, optional editable-range pager, selection and bulk actions, responsiveness, accessibility, window-size persistence.

### Modified Capabilities
- `list-pagination`: adds the `range` request kind and replaces the shared control's format and placement (editable range, top-right of the list header, no "Page X of Y", no page-size choice); Transactions and Imported Transactions use windows (default 50).
- `account-form-view`: its Transactions-tab requirement described the pager as "Page X of Y"; reworded to the shared range control.

## Impact

Measured by audit (all under `apps/web/src`) unless marked estimate.

- **Deleted source files (4):** `components/SearchComponent.tsx` (483 lines; only `groupByFields` 450-483 is used), `pages/Debts/components/EmptyState.tsx` (moved to `components/EmptyState.tsx`), `pages/Transactions/components/ImportedTransactionsPanel.tsx` (148 lines, absorbed), `components/PageHeader.tsx` (29 lines, 6 importers).
- **Created source files (4):** `components/ListView.tsx`, `hooks/useListSelection.ts`, `utils/groupByFields.ts` (moved), `components/EmptyState.tsx` (moved). Genuinely new shared files: 2. Types go in the existing `types/common.types.ts`; `MAX_LIST_WINDOW` is an unexported constant in `components/Pagination.tsx` (the server clamp stays the hard bound). Net source files: -4 + 4 = 0.
- **Simplified files (18):** `TransactionList`, `AccountsPage`, `CategoriesPage`, `SharedExpensesListCard`, `GroupsListCard`, `GroupCategoriesSection`, `BalancesTab`, `SettledDebtsTab`, `PendingRequestsTab`, `useDebtSettlementWorkflow`, `TransactionsPage`, `useImportedTransactionsWorkflow`, `useRelatedTransactions`, `RelatedTransactionsList`, `ImportedTransactionsFiltersCard`, `ImportedTransactionSelectionToolbar`, `Pagination`, `usePagination`. Repoint-only: `SharedExpensesPage`, `PersonDebtDetail`, `DebtTable`, `AwaitingAcceptanceTab` (shared `EmptyState` import only).
- **Shared components reused or extended (7):** `AddRecordButton`, `SearchBar`, `RecordCard`, `Card` (reused); `Pagination`, `usePagination`, `RelatedList` (extended with `headerActions`).
- **Lines:** about 362 duplicated lines removed (measured, gross), plus 449 dead lines (`SearchComponent` minus `groupByFields`) and about 117 absorbed from the Panel; about 470 new lines (estimate). Net about -450 lines (estimate); most of it is dead-code removal, not deduplication.
- **Tests:** deleted with source (4): `SearchComponent.test` (its `groupByFields` describe moves to `utils/tests/groupByFields.test.ts`), Debts `EmptyState.test` (moves to `components/tests`), `ImportedTransactionsPanel.test` (migrates into `TransactionsPage.test`), `PageHeader.test` (migrates into `ListView.test`). New (2): `ListView.test`, `useListSelection.test` (`usePagination.test` covers the merged paging hook). About 20 updated (estimate; listed in tasks). `RelatedList.test` and the six caller tests must pass unchanged.
- **Outside this repo:** `/Users/razs/packages/datasieve` (range kind, tests, publish).
- **API/other specs:** `public-rest-api` already returns 400 for non-offset pagination on `/v1/transactions`, and MCP tools take `page`/`pageSize` only, so the `range` kind stays internal and needs no delta there.
- Docs: `apps/web/CLAUDE.md` component list.
- Unchanged: `NotificationsMenu`, API Keys, Connected Apps, Dashboard recent list, Reports, `PersonDebtDetail`/`DebtTable` table markup.
