# Design

## Context

See proposal.md for motivation and counts. Current state (`apps/web/src`, verified):

- `components/` has 25 flat entries plus `ListView/` (already a directory with `index.ts`). Largest files: `FilterBuilder.tsx` 521, `SearchBar.tsx` 420, `CurrencySelect.tsx` 299.
- `FilterBuilder.tsx` exports only `FilterBuilder` (lines 37-120) and holds four private components: `DomainGroupEditor` (121), `ConditionEditor` (235), `FieldValueInput` (323), `MultiValueInput` (469). Its only importer is `SearchBar.tsx:18`; its test is `components/tests/FilterBuilder.test.tsx`. `DateTimeFilterInput` is also used by `pages/Reports/components/ReportFiltersCard.tsx`, so it stays flat.
- `SearchBar.tsx` exports `SearchBar` and `SearchBarQuery`. 17 files reference `components/SearchBar`: 14 page-level importers, `RelatedTransactionsList.tsx`, `hooks/useRelatedTransactions.ts` (both move), and its test.
- `RelatedTransactionsList.tsx:4` imports `pages/Transactions/utils/transactionSearchFields` (the only `components/` to `pages/` import) and `:12` deep-imports `./ListView/ListViewPagination`. Consumers: `pages/Groups/GroupDetailPage.tsx`, `pages/Accounts/AccountDetailPage.tsx`.
- `CategoryCard` (95 lines) imports `CategoryForm` (104). Consumers: `CategoriesPage.tsx` and `Groups/components/GroupCategoriesSection.tsx`.
- Dismissal effects: `ActionMenu.tsx:24-42` and `SearchBar.tsx:95-113` use `pointerdown` + `keydown` on `document`. `CurrencySelect.tsx:116-143` uses `mousedown` on `document` + `keydown` on `window`, and its dismissal also clears the typed query.
- Highlight scroll effect: `DebtsPage.tsx:203-216`, `PersonDebtDetailPage.tsx:84-91`, `SharedExpensesPage.tsx:45-62`. All three do `if (!targetId || isLoading) return; requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({block:"center", behavior:"smooth"}))`. They differ only in how `targetId` is derived (id-prefix precedence, kept in the page) and, in `DebtsPage`, an extra `activeTab` dependency.
- `public/logo.svg` and `src/utils/search.ts` have no reference in `src`, `index.html`, `manifest.webmanifest`, CSS or docs other than the audit note in the #46 change (`frontend-cleanup-audit.md:12-13`); `matchesSearch` is imported only by its own test.

## Goals / Non-Goals

**Goals:**
- Make `components/` mean "model-agnostic shared UI" with a dependency direction that can be grep-checked (see spec).
- One owner for dismissal and highlight-scroll behaviour.

**Non-Goals (deferred, no KNOWN_ISSUES entries):**
- A shared confirm dialog (seven `window.confirm` uses; replacing them changes UI).
- A query-invalidation helper (the invalidated lists differ per mutation).
- A shared date formatter (formats differ per screen).
- About 55 dead exports and unused client functions (the latter need an API-side check).
- Promoting `MultiSelectFilter`; moving `SharedExpensesPage` out of `DebtsPage`.
- Replacing `FilterBuilder`'s hand-rolled modal chrome with `ModalDialog` (behaviour risk: focus, scroll lock, stacking). Its chrome moves untouched.
- Any directory for single-file components; kept flat: GoogleIcon (with its sole consumer GoogleOAuthButton, 32 and 24 lines), Button, Card, RecordCard, RelatedList, ModalDialog, ActionMenu, DropdownMenu, AddRecordButton, CopyButton, FormField, EditableField, CurrencySelect, DateTimeFilterInput, FormView, Tabs, BrandLogo, EmptyState (each is one file with no private member).

## Decisions

### 1. `components/SearchBar/` directory
Contents: `SearchBar.tsx`, `FilterBuilder.tsx` (private), `ConditionEditor.tsx` (private; holds `DomainGroupEditor`, `ConditionEditor`, `FieldValueInput`, `MultiValueInput`, exporting only what `FilterBuilder` uses), `index.ts` (`export { SearchBar } from "./SearchBar"; export type { SearchBarQuery } from "./SearchBar";`), `tests/SearchBar.test.tsx`, `tests/FilterBuilder.test.tsx`. Expected sizes: `FilterBuilder.tsx` about 125, `ConditionEditor.tsx` about 410, `SearchBar.tsx` about 410 after Decision 4. The split is by cohesion: `FilterBuilder` is the public modal, and the four sub-editors are distinct private units that nothing else uses (about 400 of its 521 lines); a file of roughly 500 lines or more is only a prompt to look for such seams, not a rule. Why a directory: this is the one component with private members. Alternative: leave flat and only split the file; rejected because it leaves private files as public-looking siblings. The `search-filter-chips` spec behaviour is unchanged: the code moves, it is not edited beyond import paths and the dismissal hook.

### 2. Model UI moves to the model's module
`CategoryCard`, `CategoryForm` to `pages/Categories/components/` (with `tests/`); `RelatedTransactionsList` to `pages/Transactions/components/` and `useRelatedTransactions` to `pages/Transactions/hooks/` (with tests). The list keeps using `RelatedList` and `ListViewPagination`, now imported via `components/ListView` (index), and `SearchBar` via `components/SearchBar`. Precedent: Groups already imports `pages/Categories/utils/categorySearchFields`. Alternative: keep in `components/` and move `transactionSearchFields` there; rejected because it makes shared code own transaction knowledge.

### 3. `hooks/useDismiss.ts`
`useDismiss(ref, onDismiss, enabled)`: while `enabled`, a `pointerdown` outside `ref.current` or an `Escape` keydown on `document` calls `onDismiss`. `onDismiss` is read through a ref so callers pass inline closures without re-subscribing. `CurrencySelect` change: `mousedown` on `document` becomes `pointerdown`, and the Escape listener moves from `window` to `document`; `onDismiss` there is `() => { setIsOpen(false); setQuery(""); }`. Real clicks and touches emit pointerdown before mousedown, so users see no difference; the existing "cancels the default mousedown on the list surface" test concerns a different handler and is untouched. Each consumer test file gets (or keeps) three cases: outside press closes, Escape closes, inside press stays open; `ActionMenu` already has outside and Escape cases (`ActionMenu.test.tsx:63,82`), so only add the missing ones.

### 4. `hooks/useScrollToHighlight.ts`
`useScrollToHighlight(targetId: string | null, isLoading: boolean, rerunKey?: string)` runs the shared effect with deps `[targetId, isLoading, rerunKey]`. Pages keep deriving `targetId` (`settlement-` before `debt-`; `shared-participant-` before `shared-expense-`). `DebtsPage` passes `activeTab` (a string) as `rerunKey` to keep its re-scroll on tab switch. `PersonDebtDetailPage` passes `highlightedDebtId ? `debt-${highlightedDebtId}` : null`. Semantics are identical to the three originals. Test with fake `requestAnimationFrame` and a stub element: scrolls when loaded, not while loading, not without a target, tolerates a missing element, re-runs when `rerunKey` changes.

### 5. Deletions
`public/logo.svg`, `utils/search.ts`, `utils/tests/search.test.ts`. Re-run the reference grep immediately before deleting (task 6.1).

## Risks / Trade-offs

- [Missed importer after a move breaks the build] -> `npm run typecheck -w apps/web` and the full web suite are gating; the moves are mechanical.
- [Splitting `FilterBuilder` changes closure scope] -> sub-editors are pure components taking props; the existing 416-line `FilterBuilder.test.tsx` must pass unchanged apart from its import path.
- [`CurrencySelect` pointerdown vs mousedown] -> described in Decision 3; regression tests added; manual smoke on touch emulation.
- [PR conflicts with #46] -> separate PR based on `feat/list-view-framework`, retargeted after #46 merges (see proposal).
- [Barrel index hides exports] -> `index.ts` exports exactly two names; the spec forbids deep imports so the surface stays small.

## Migration Plan

Single PR, no data or deploy steps. Land groups in the order of tasks.md; each group typechecks on its own. Rollback is a revert.
