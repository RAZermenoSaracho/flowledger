# Proposal

## Why

`apps/web/src/components/` is a flat folder of 25 files that mixes truly shared primitives with model-specific UI (`CategoryCard`, `CategoryForm`, `RelatedTransactionsList`), a private sub-component promoted to a sibling (`FilterBuilder`, whose only importer is `SearchBar`), and hand-rolled copies of the same behaviour (outside-click/Escape dismissal x3, scroll-to-highlighted-record x3). `components/RelatedTransactionsList.tsx:4` is the only `components/` file importing from `pages/`, and `FilterBuilder.tsx` is 521 lines. There are also two unreferenced files. The list-view change (#46) just landed the shared list shell; this is the follow-up that makes the rest of the shared layer predictable.

## What Changes

Behaviour-preserving refactor. No UI redesign, no new dependencies, no API or schema change.

- New directory `components/SearchBar/` holding `SearchBar.tsx`, `FilterBuilder.tsx` (private) and a new private `ConditionEditor.tsx` (FilterBuilder's four sub-editors) plus `index.ts` exporting `SearchBar` and `SearchBarQuery`. 14 page-level importers plus the 2 moved files are repointed to the directory index; the two tests move to `SearchBar/tests/`.
- Model-specific UI moves to its owning page module: `CategoryCard`, `CategoryForm` to `pages/Categories/components/`; `RelatedTransactionsList` and `useRelatedTransactions` to `pages/Transactions/components/` and `pages/Transactions/hooks/`. Other modules import them from there (as Groups already imports `pages/Categories/utils/categorySearchFields`). This removes the only `components/` to `pages/` import and the deep import of `./ListView/ListViewPagination`.
- New `hooks/useDismiss.ts` replaces the three hand-rolled outside-pointerdown + Escape effects in `ActionMenu`, `SearchBar`, `CurrencySelect`. `CurrencySelect` currently listens to `mousedown` on `document` and `keydown` on `window`; it standardises on `pointerdown`/`keydown` on `document` (negligible for mouse and touch, see design).
- New `hooks/useScrollToHighlight.ts` replaces the identical `requestAnimationFrame` + `getElementById` + `scrollIntoView` effect in `DebtsPage`, `PersonDebtDetailPage`, `SharedExpensesPage`.
- Delete unreferenced `apps/web/public/logo.svg` and `apps/web/src/utils/search.ts` with its test.
- Kept flat on purpose (single file, no private member): GoogleIcon (with its only consumer GoogleOAuthButton), Button, Card, RecordCard, RelatedList, ModalDialog, ActionMenu, DropdownMenu, AddRecordButton, CopyButton, FormField, EditableField, CurrencySelect, DateTimeFilterInput, FormView, Tabs, BrandLogo, EmptyState; `ListView/` is already organized.

Counts (verified against the tree unless marked estimate): new directories 1 (`components/SearchBar/`, plus its `tests/`); files moved 12 (6 sources, 6 tests); merged 0; new files 6 (`SearchBar/index.ts`, `SearchBar/ConditionEditor.tsx`, `useDismiss.ts` + test, `useScrollToHighlight.ts` + test); deleted 3 (`logo.svg`, `search.ts`, `search.test.ts`); simplified 6 (`ActionMenu`, `SearchBar`, `CurrencySelect`, `DebtsPage`, `PersonDebtDetailPage`, `SharedExpensesPage`). Net line change is an estimate: roughly -150 to -200 lines of source.

## Capabilities

### New Capabilities
- `web-component-organization`: structural rules for the web shared layer (`components/`, `hooks/`): dependency direction, where model-specific UI lives, when a component directory exists, how it is imported, and which behaviours must go through a shared hook.

### Modified Capabilities
<!-- None. search-filter-chips behaviour is unchanged. -->

## Impact

- Code: `apps/web/src` only (components, hooks, utils, 14 page importers, 3 pages, `public/logo.svg`). Tests move or are added; no test is dropped except the deleted `search.test.ts`.
- No dependency, API, shared-package or database impact. No user-visible change except the `CurrencySelect` dismissal event type.
- `docs/` unaffected beyond `apps/web/CLAUDE.md` folder-structure notes if they list `components/` files (checked in tasks).

## Recommendation

Ship as a separate PR from #46 (the list-view framework). Base it on `feat/list-view-framework` now (it touches files #46 just created, e.g. `ListView/` imports) and retarget to `razs_ai` once #46 merges. Keeping it separate keeps #46 reviewable and this PR mechanical (mostly moves; the only logic changes are the two hooks).
