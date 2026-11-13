# Design

## Context

See proposal.md for motivation and the measured impact. Current state (`apps/web/src`):

- `components/ListView/ListViewPagination.tsx` renders Previous / "Page X of Y · N results" / Next below the list (`TransactionsPage.tsx:307-317, 411-418`, `RelatedTransactionsList.tsx:83-92`).
- `hooks/usePagination.ts` owns page, page size and the page-count clamp. Three callers repeat `useQuery` + `keepPreviousData` + `syncPageCount`: `TransactionsPage.tsx:120-134`, `useImportedTransactionsWorkflow.ts:35-52`, `useRelatedTransactions.ts:26-36`.
- Only `GET /transactions` returns `{ data, meta: { total, page, pageSize, pageCount, hasNext, hasPrevious } }`. `GET /transactions/imported` returns `{ importedTransactions, total, pendingCount }` and passes pagination through the same sieve (`importedTransactionQuery.ts:217-221`). Other lists are small and unpaginated.
- Verified API facts: `listPaginationSchema` (`packages/shared/src/schemas/common.ts:52-63`) accepts only `{kind:"offset",page,pageSize}` or `{kind:"cursor",...}`. The datasieve prisma adapter computes `skip=(page-1)*pageSize` (`datasieve/packages/prisma/src/translate/pagination.ts`), so a window such as 7-26 is not expressible today. `createSieve` clamps `pageSize` to `maxPageSize` (`apps/api/src/db/sieve.ts` ~64-67; `MAX_TRANSACTION_PAGE_SIZE` is 10000).
- Imported selection (`useImportedTransactionsWorkflow.ts:64-67, 169-189, 204-212`): ids plus a `selectAllFilteredImported` flag. Changing page clears ids but not the flag; changing the query clears both; every mutation `onSuccess` clears both.
- `docs/TESTING.md`: tests sit in a sibling `tests/` folder; `fetch` is mocked with `msw`, never by mocking a `.client.ts`.

## Goals / Non-Goals

**Goals:**
- One presentation shell, one paging hook, one selection hook, one pager (Odoo-style editable range) for every page-level list.
- Keep model logic (classification, colours, status gating, debt workflows, money formatting) in the modules.
- Fix missing loading/error states and the bottom-of-list pager as a side effect.
- Delete dead and duplicated code (see Migration inventory).

**Non-Goals:**
- A client-side paging hook, new endpoints, or counts for small lists. Non-transaction lists stay unpaginated; the pager state interface is documented so a future client-side list can reuse it.
- URL-persisted list state. Only `limit` is remembered, per viewer.
- Rewriting `SearchBar`, its fields memoization, or `search-filter-chips`.
- Virtualization, column sorting UI, drag-and-drop, wrap-around paging.
- Migrating `NotificationsMenu`, API Keys, Connected Apps, Dashboard recent, Reports, `PersonDebtDetail`/`DebtTable` markup.
- Other frontend cleanup candidates: see the separate `frontend-cleanup-audit.md` (out of scope).

## Decisions

### 1. Thin shell, not a monolithic data-aware list
`ListView<T>` only presents: items or groups (mutually exclusive), a card renderer, state flags, an optional pager and selection. It imports nothing from `pages/` and fetches nothing. Rejected: an Odoo-style config object taking endpoint, fields and actions; it pulls model knowledge into shared code.

### 2. Slots plus a small prop set
`title`, `subtitle`, `actions`, `toolbar`, `bulkActions` are `ReactNode` props; rows are rendered by `renderItem`. Rejected: free `children` (loses shared states and grouping) and one `config` object (defeats inference of `T`). `ListView` owns the title/actions/toolbar layout, so `PageHeader` is deleted.

### 3. Cards only; `RelatedList` stays a table
`ListView` renders cards (`renderItem`, `layout` stack or grid). There is no table mode: `RelatedList` stays a standalone responsive table and only gains an optional `headerActions?: ReactNode` slot at the top-right of its title row, where `RelatedTransactionsList` renders the shared range pager (replacing its footer pager at 83-92). It may swap its empty `<p>` for `EmptyState`. Its six callers and tests are unchanged.

### 4. Editable-range pagination replaces the page-size dropdown
State is `{offset, limit}`. The user edits the window directly instead of choosing a page size (the dropdown was rejected). Behavior:

| Aspect | Rule |
|---|---|
| Display | `{offset+1}-{min(offset+limit,total)} / {total}`; total unknown: `{offset+1}-{offset+limit}`; total 0: pager hidden |
| Edit | click, Enter or Space on the range opens a text input prefilled "41-80" |
| Parse | `a-b`, whitespace and en-dash tolerated; only Enter applies a valid entry; Escape and blur always cancel and restore |
| Invalid on Enter | input stays open, `aria-invalid`, message "Enter a range like 1-40" |
| Validation | integers only; `a>=1`; `b>=a`; `b-a+1 <= MAX_LIST_WINDOW` (500); total known: `a>total` invalid, `b>total` accepted and shown clamped. Negative, reversed, zero, non-numeric, single number: invalid |
| Apply | `offset=a-1`, `limit=b-a+1` (editing changes the window size) |
| Next | `offset += limit`; disabled when `!hasNext` or `offset+limit >= total` |
| Previous | `offset = max(0, offset-limit)`; disabled at offset 0 |
| Nonstandard start | preserved: 7-26 then Next gives 27-46; Previous from 7-26 gives 1-20 |
| Wrap-around | none (deliberate divergence from Odoo; keeps disabled-at-ends) |
| While fetching | arrows disabled; previous rows stay (`keepPreviousData`) |
| Reset | search/filter/sort change: `offset=0`, `limit` kept. Total shrinks so `offset>=total`: `offset=max(0,total-limit)` |
| Persistence | only `limit`, in `localStorage` `flowledger:list-limit:<storageKey>` (try/catch; invalid or out-of-bounds values ignored). Offset never persisted. Defaults: transactions 50, imported 50, related 20 |
| Mobile | same control in its own full-width row under the title; `input type="text"` (a dash is needed) with at least 44px tap targets; fits 320px |
| A11y | range button `aria-label` "Records 41 to 80 of 312, edit range"; arrows "Previous records" / "Next records"; range text `aria-live="polite"`; error linked via `aria-describedby` |

`MAX_LIST_WINDOW` (500) is defined once in `constants/listWindow.ts` (shared by `ListViewPagination` and `usePagination`); the server clamp (`maxPageSize`) remains the hard bound.

### 5. Backend: additive `range` pagination kind
Arbitrary windows are not expressible with page/pageSize, so datasieve gains `{kind:"range", offset:int>=0, limit:int>=1}` mapping to prisma `skip=offset, take=limit`. Meta: `total`, `hasNext = offset+limit < total`, `hasPrevious = offset > 0`, `page` and `pageCount` null. Work: the query-language schema, core build-response, prisma translate and tests in `/Users/razs/packages/datasieve`, then publish and bump the version in `apps/api/package.json`. FlowLedger adds the variant to `listPaginationSchema`, and `createSieve` clamps `limit` to `maxPageSize` like `pageSize`. The imported path needs no change beyond this because it uses the same sieve. Existing page and cursor kinds are untouched, so `/v1` and MCP are unaffected (`public-rest-api` already returns 400 for non-offset pagination; MCP tools take `page`/`pageSize` only), hence no delta for those specs.
Rejected alternatives:
- Snap the typed range to aligned pages: breaks exact windows (7-26).
- Fetch rows 1..end and slice client-side: loads the whole history for a deep window.
- Page-size dropdown: the user rejected it.
Cost: the change spans two repos and needs a publish before the web work can pass its gates; phase 0 is therefore sequential and first.

### 6. One controlled pager interface for server and client lists
```ts
ListPagerState = { offset, limit, total: number | null, hasNext, isFetching,
                   onRangeChange(offset, limit) }
```
Server lists send `{kind:"range", offset, limit}` from it. A client-side list would pass `total = items.length` and render `items.slice(offset, offset+limit)`. This is documented only; no client paging hook is built (no current consumer).

### 7. Selection
`useListSelection` keeps ids in a `Set` and an `allMatching` flag. It clears both when `resetKey` changes (the serialized query). `pageKey` becomes a `windowKey` of `${offset}:${limit}`: on change, ids clear but `allMatching` stays, preserving current imported behavior (`allMatching` is the cross-window mechanism). Ticking one row while `allMatching` is true drops the flag and selects the visible window minus that row (`toggle(id, windowIds)`). Modules still call `clear()` in mutation `onSuccess`. "Select all N matching" sets a flag the module maps to its own contract (imported: `{mode:"filtered", where}`); ids are never loaded client-side.

### 8. Hooks
One hook, `usePagination({ queryKey, resetKey, fetchPage, defaultLimit, storageKey? })`, owns `{offset, limit}` state, limit persistence, reset, the total-shrink clamp (replacing `syncPageCount`) and `useQuery` + `keepPreviousData`. It calls `fetchPage({kind:"range", offset, limit})` and derives `hasNext`/`total` from the response; the imported response has only `total`, so `hasNext = offset+limit<total`. There is no separate `usePagedList`.

### 9. Smaller moves
`groupByFields` goes to `utils/groupByFields.ts`; `SearchComponent.tsx` is deleted; `EmptyState` moves to `components/EmptyState.tsx`; list types go into the existing `types/common.types.ts` (where `RelatedList` column types already live), not a new file.

## Alternatives considered (rejected review suggestions)

- Merge `total` into the pager: client-filtered, unpaginated Debts lists need "x of y" against the unfiltered total without a pager.
- Cut `layout`: `ListView` owns the item container, so stack vs grid cannot be expressed by a per-item renderer.
- Move `bulkActions` into `selection`: selection comes from a hook, while actions are JSX the module renders.
- `items` plus a group-by function: modules already build groups with `groupByFields`; `items` and `groups` stay mutually exclusive.
- Drop the `useDebtSettlementWorkflow` selection migration: its hand-rolled `Set` selection (about 50 lines) backs the `PendingRequestsTab` selection bar that `ListView`'s `selection` prop consumes; that is the consolidation.
- Inline `ImportedTransactionsFiltersCard` into `TransactionsPage`: it owns search-field memoization and `initialDomain`; inlining bloats the page.
- Cut the client-side pager sentence: kept to one sentence (decision 6), no hook.

## Interfaces

```ts
// types/common.types.ts
export type ListGroup<T> = { key: string; label: ReactNode; items: T[] };
export type ListPagerState = {
  offset: number; limit: number; total: number | null; hasNext: boolean; isFetching: boolean;
  onRangeChange: (offset: number, limit: number) => void;
};
export type ListSelection = {
  count: number; allMatching: boolean; canSelectAllMatching: boolean; total?: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string, windowIds?: string[]) => void;
  setWindow: (ids: string[], on: boolean) => void;
  selectAllMatching: () => void; clear: () => void;
};
export type ListViewProps<T> = {
  title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; toolbar?: ReactNode;
  items?: T[]; groups?: ListGroup<T>[]; rowKey: (item: T) => string;
  renderItem: (item: T) => ReactNode; layout?: "stack" | "grid";
  isLoading?: boolean; error?: string | null; emptyText: ReactNode; total?: number;
  pager?: ListPagerState; selection?: ListSelection; bulkActions?: ReactNode;
};

// hooks/usePagination.ts
usePagination<T>({ queryKey, resetKey, fetchPage: (p: RangePagination) => Promise<{ items: T[]; total?: number; hasNext?: boolean }>,
  defaultLimit, storageKey? }): { items: T[]; pager: ListPagerState; isLoading; isFetching; error: string | null; data: unknown }

// hooks/useListSelection.ts
useListSelection({ resetKey, windowKey?, total?, canSelectAllMatching? }):
  ListSelection & { selectedIds: Set<string>; toRequest: () => { mode: "ids"; ids: string[] } | { mode: "all" } }
```
`items` is memoized from `data`. `ListView` never clones or rebuilds the `toolbar` element.

## Header sketch

```
Desktop
| Transactions                          [+ Add]   ‹ 41-80 / 312 › |
| 312 results                                                     |
| [ search bar ........................................ ]         |
| [ 3 selected · Select page · Clear · <bulk actions> ]            |
Mobile (320px)
| Transactions          [+ Add]  |
| ‹      41-80 / 312       ›     |
| [ search bar ............. ]   |
```

## Migration inventory (measured by audit, all under `apps/web/src`)

| Action | File | Detail |
|---|---|---|
| DELETE | `components/SearchComponent.tsx` | 483 lines, only `groupByFields` (450-483) used. Repoint `TransactionsPage:10`, `AccountsPage:6`, `CategoriesPage:9`, `SharedExpensesListCard:4` and its re-export at `:26` (used by `SharedExpensesPage:9`). Remove stale path comments `SharedExpensesPage:16`, `TransactionsPage:35`, `AccountsPage:36`, `CategoriesPage:24` |
| DELETE (move) | `pages/Debts/components/EmptyState.tsx` | to `components/EmptyState.tsx`; importers `PersonDebtDetail`, `PendingRequestsTab`, `SettledDebtsTab`, `DebtTable`, `BalancesTab`, `AwaitingAcceptanceTab` |
| DELETE | `pages/Transactions/components/ImportedTransactionsPanel.tsx` | 148 lines; sole importer `TransactionsPage:14`. Its `batchError`/`getBatchErrors` block (87-97) moves into `ImportedTransactionSelectionToolbar`, which becomes the `bulkActions` content; card wiring moves into the `ListView` `renderItem` in `TransactionsPage` |
| DELETE | `components/PageHeader.tsx` | 29 lines; importers `GroupsListCard`, `SharedExpensesListCard`, `TransactionsPage`, `ImportedTransactionsFiltersCard`, `AccountsPage`, `CategoriesPage` all move to the `ListView` header |
| CREATE | `components/ListView/ListView.tsx`, `hooks/useListSelection.ts` | new shared files (2) |
| CREATE (move) | `utils/groupByFields.ts`, `components/EmptyState.tsx` | moved code (2) |
| SIMPLIFY | `ImportedTransactionsFiltersCard.tsx` | toolbar-only `SearchBar` wrapper; keeps fields memo (31-45) and `initialDomain` (46-52); loses Card/PageHeader shell |
| SIMPLIFY | `ImportedTransactionSelectionToolbar.tsx` | generic selection UI (26-40, 44-79) absorbed by the `ListView` selection bar; keeps batch category + Import/Ignore/Unignore (81-124) + `batchError`; props type at `types/transactions.types.ts:70-89` shrinks |
| SIMPLIFY | `TransactionList.tsx` | empty `<p>` 134-138, group shell 44-51/131-133 |
| SIMPLIFY | `AccountsPage.tsx` | group shell 130-137/145-147, empty 149-153 |
| SIMPLIFY | `CategoriesPage.tsx` | 188-195/217-219, 220-224 |
| SIMPLIFY | `SharedExpensesListCard.tsx` | 76-83/97-99, 100-104 |
| SIMPLIFY | `GroupsListCard.tsx` | empty 64-68 |
| SIMPLIFY | `GroupCategoriesSection.tsx` | loading/empty ternary 131-137 |
| SIMPLIFY | `BalancesTab` 29-41, `SettledDebtsTab` 27-37, `PendingRequestsTab` 87-98 | duplicated "x of y" headers |
| SIMPLIFY | `PendingRequestsTab` 142-178 | select-all/clear/settle trio becomes selection bar + `bulkActions` |
| REPOINT | `AwaitingAcceptanceTab` | shared `EmptyState` import only; no `ListView` migration |
| SIMPLIFY | `hooks/useDebtSettlementWorkflow.ts` | hand-rolled `Set` selection (33-38, 290-309, 334-357) becomes `useListSelection`; verify `DebtsPage` / `PersonDebtDetailPage` prop impact |
| SIMPLIFY | `TransactionsPage.tsx` | pager wiring 307-317, 411-418; paging/query 120-134 |
| SIMPLIFY | `useImportedTransactionsWorkflow.ts` | paging 35-52, memo 60-63, selection 64-67/169-189/204-212 |
| SIMPLIFY | `useRelatedTransactions.ts` 26-36; `RelatedTransactionsList.tsx` footer pager 83-92 | onto `usePagination` / `headerActions` pager |
| EXTEND | `RelatedList.tsx` | adds optional `headerActions` slot only (counted as extended, not simplified) |
| SIMPLIFY | `ListViewPagination.tsx`, `usePagination.ts` | rewritten in place |
| REPOINT | `SharedExpensesPage`, `PersonDebtDetail`, `DebtTable` | imports only |
| KEEP | `ImportedTransactionCard`, `AccountListItem`, `CategoryCard`, `GroupCard`, `SharedExpenseListItem`, `SettlementRequestCard`, `DebtSummaryCard`, `DebtTable`/`PersonDebtDetail` bodies, `AddRecordButton`, `SearchBar`, `RecordCard`, `Card`, `FilterBuilder`, `NotificationsMenu`, ApiKeys/ConnectedApps | unchanged |

Counts: DELETE 4, CREATE 4 (2 genuinely new, 2 moves), net source files 0, SIMPLIFY 18, shared components reused or extended 7. Lines: about 362 duplicated removed (measured, gross) + 449 dead + about 117 absorbed; about 470 new (estimate); net about -450 (estimate), mostly dead-code removal.

## Acceptance criteria for editable ranges

Each is covered by `Pagination.test.tsx` unless noted.
1. Range reads `{offset+1}-{min(offset+limit,total)} / {total}`; unknown total omits `/ total`; total 0 hides the pager.
2. Click, Enter and Space open a prefilled input; only Enter applies; Escape and blur always restore without applying.
3. "7-26", " 7 – 26 " (en-dash, spaces) apply `offset=6, limit=20`.
4. Invalid: "40-1", "-5-10", "0-10", "abc", "7", "1.5-9", a 501-row window, `a>total`: input stays open, `aria-invalid`, message shown, no `onRangeChange`.
5. `b>total` is accepted and displays clamped.
6. Next/Previous from 7-26 give 27-46 and 1-20; disabled at both ends and while fetching; no wrap.
7. Search/filter/sort change keeps `limit`, sets `offset=0`; total shrink clamps `offset` (`usePagination.test`).
8. `limit` persists to `flowledger:list-limit:<key>`, ignores invalid/out-of-bounds values, survives throwing storage; offset never stored.
9. A server list sends `{kind:"range", offset, limit}` (`usePagination.test`, msw).
10. At 320px the pager is its own row, no horizontal scroll, tap targets at least 44px (`ListView.test` + manual check).
11. Shared list files never import from `pages/` (grep task 3.1).

## Risks / Trade-offs

- Two-repo dependency: web gates cannot pass until the datasieve release is published and bumped. Mitigation: phase 0 first, sequential.
- `SearchBar` `fields` must stay memoized (an inline array re-triggers `onQueryChange` every render, see `useImportedTransactionsWorkflow.ts:56-59`). `ListView` never rebuilds the toolbar; a test asserts a bounded render count.
- Imported selection regressions: decision 7 preserves current semantics; regression tests before and after migration.
- Deep windows (`offset` large) use `skip`, which gets slower on huge tables; acceptable for per-user data.
- Pager at the top: accepted (Odoo pattern).
- New loading/error states may flash; loading shows only with no rows.
- Big-bang risk: one migration per view; foundations ship first.

## Migration Plan

0. Backend: datasieve range kind, publish, bump; schema variant; sieve clamp.
1. Foundations (additive): `EmptyState`, `groupByFields`, `Pagination`, `usePagination`, `useListSelection`, `ListView`, `RelatedList` `headerActions`.
2. Migrate one view at a time: Related Transactions, Transactions, Imported, Accounts, Categories, Groups, Shared Expenses, Debts, Group Categories.
3. Cleanup deletions, docs, gates, manual 320px check.
Rollback: revert one view's commit; foundations and the backend variant are additive.

## Testing Strategy

See tasks for the file list. Unit tests per new/changed file; `msw` for client calls; regression tests for range parsing, keyboard, navigation, reset, persistence, selection across windows, server request shape, mobile layout and existing model workflows (transactions group-by on current window, imported import/ignore/unignore with status gating, debts settle/request selected). API: shared schema test and a sieve/API test. Gate: root `npm run typecheck`, `npm run lint`, `npm run test`; manual 320px check.
