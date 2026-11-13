# Tasks

Every new or changed `components/`, `hooks/`, `utils/` file gets a matching `tests/` file (docs/TESTING.md); every export gets TSDoc; no narrating comments. "(mechanical)" marks tasks suitable for Codex. Paths are under `apps/web/src`. Groups 1 to 5 touch disjoint files except group 1 and group 3 (both edit `components/SearchBar.tsx`), so run 1 before 3; 2, 4 and 5 can run in parallel with each other and with 1. Group 2 and group 1 both change import lines in `pages/Categories/CategoriesPage.tsx` and `pages/Groups/components/GroupCategoriesSection.tsx`: do group 2 first or accept a trivial merge.

## 1. SearchBar directory

- [x] 1.1 (mechanical) `git mv components/SearchBar.tsx components/FilterBuilder.tsx components/SearchBar/` and `components/tests/SearchBar.test.tsx components/tests/FilterBuilder.test.tsx components/SearchBar/tests/`; fix their relative imports. Verify: `ls components/SearchBar components/SearchBar/tests`.
- [x] 1.2 Move `DomainGroupEditor`, `ConditionEditor`, `FieldValueInput`, `MultiValueInput` (`FilterBuilder.tsx` 121-521) into `components/SearchBar/ConditionEditor.tsx`, exporting only what `FilterBuilder.tsx` imports (TSDoc on the exports). Verify: `components/SearchBar/tests/FilterBuilder.test.tsx` passes unchanged except its import.
- [x] 1.3 Add `components/SearchBar/index.ts` exporting `SearchBar` and type `SearchBarQuery` only. Verify: `grep -c export components/SearchBar/index.ts` is 2.
- [x] 1.4 (mechanical) Repoint to `components/SearchBar` (directory index): `pages/Accounts/AccountsPage.tsx`, `pages/Categories/CategoriesPage.tsx`, `pages/Debts/DebtsPage.tsx`, `pages/Debts/components/{BalancesTab,PendingRequestsTab,SettledDebtsTab}.tsx`, `pages/Groups/GroupsPage.tsx`, `pages/Groups/components/{GroupCategoriesSection,GroupsListCard}.tsx`, `pages/SharedExpenses/SharedExpensesPage.tsx`, `pages/SharedExpenses/components/SharedExpensesListCard.tsx`, `pages/Transactions/TransactionsPage.tsx`, `pages/Transactions/components/ImportedTransactionsFiltersCard.tsx`, `pages/Transactions/hooks/useImportedTransactionsWorkflow.ts` (14 files). Verify: `npm run typecheck -w apps/web`; `grep -rnE "SearchBar/(SearchBar|FilterBuilder)" . ` outside `components/SearchBar/` is empty.

## 2. Model-specific UI moves (mechanical; parallel with 1, 4, 5)

- [x] 2.1 (mechanical) Move `components/CategoryCard.tsx`, `components/CategoryForm.tsx` to `pages/Categories/components/`, and `components/tests/CategoryCard.test.tsx`, `components/tests/CategoryForm.test.tsx` to `pages/Categories/components/tests/`; repoint `pages/Categories/CategoriesPage.tsx` and `pages/Groups/components/GroupCategoriesSection.tsx`. Verify: both tests pass at the new path.
- [x] 2.2 (mechanical) Move `components/RelatedTransactionsList.tsx` to `pages/Transactions/components/` and `hooks/useRelatedTransactions.ts` to `pages/Transactions/hooks/`, with `components/tests/RelatedTransactionsList.test.tsx` and `hooks/tests/useRelatedTransactions.test.ts` to the sibling `tests/` folders. In the moved list import `ListViewPagination` from `components/ListView` (index; add the export there if missing) and `SearchBar` from `components/SearchBar`. Repoint `pages/Groups/GroupDetailPage.tsx` and `pages/Accounts/AccountDetailPage.tsx`. Verify: `grep -rn "pages/" components --include=*.tsx --include=*.ts` excluding `tests/` is empty; moved tests pass.

## 3. useDismiss (after group 1; consumers can run in parallel with 4 and 5)

- [x] 3.1 Add `hooks/useDismiss.ts` per design decision 3 and `hooks/tests/useDismiss.test.tsx` (outside press, Escape, inside press, disabled, latest callback used). Verify: test passes.
- [x] 3.2 Use it in `components/ActionMenu.tsx` (24-42) and `components/SearchBar/SearchBar.tsx` (effect at ~95-113). Add missing cases to `ActionMenu.test.tsx` and `SearchBar/tests/SearchBar.test.tsx`: outside closes, Escape closes, inside stays open. Verify: both files pass.
- [x] 3.3 Use it in `components/CurrencySelect.tsx` (116-143) with `onDismiss` closing and clearing the query; add the same three cases to `components/tests/CurrencySelect.test.tsx` (Escape and mousedown-surface cases already exist, do not duplicate). Verify: file passes.

## 4. useScrollToHighlight (parallel)

- [x] 4.1 Add `hooks/useScrollToHighlight.ts` (`rerunKey?: string`) per design decision 4 and `hooks/tests/useScrollToHighlight.test.tsx`. Verify: test passes.
- [x] 4.2 Replace the effects in `pages/Debts/DebtsPage.tsx` (203-216, pass `activeTab` as `rerunKey`), `pages/Debts/PersonDebtDetailPage.tsx` (84-91), `pages/SharedExpenses/SharedExpensesPage.tsx` (45-62); drop now-unused `useEffect` imports. Verify: `grep -rn scrollIntoView pages` is empty and the three pages' existing tests pass.

## 5. Dead files (mechanical, parallel)

- [x] 5.1 (mechanical) Re-run `grep -rIn "logo\.svg" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=openspec` and `grep -rn "utils/search['\"]\|matchesSearch" apps/web` (expect no hits outside the files themselves), then delete `apps/web/public/logo.svg`, `utils/search.ts`, `utils/tests/search.test.ts`. Verify: `npm run build -w apps/web` succeeds.

## 6. Gates (after 1 to 5)

- [ ] 6.1 `npm run typecheck`, `npm run lint`, `npm run test -w apps/web`, `npm run build -w apps/web` all pass.
- [ ] 6.2 Spec grep checks: no `pages/` import under `components/` (non-test); no deep imports of `components/SearchBar/*` or `components/ListView/*` outside those directories; `grep -rn 'addEventListener("pointerdown"\|addEventListener("mousedown"' components` only matches `hooks/useDismiss.ts` (and none in `components/`).
- [ ] 6.3 Update `apps/web/CLAUDE.md` line 246 (shared-components list: `SearchBar/` directory, new `useDismiss` and `useScrollToHighlight`, category and related-transaction UI now under their page modules) and the `FilterBuilder.tsx` path mentions in `docs/KNOWN_ISSUES.md` (~361-367). Verify: `grep -n "components/FilterBuilder" apps/web/CLAUDE.md docs/KNOWN_ISSUES.md` is empty.
- [ ] 6.4 Manual smoke (dev server): search bar quick search, filter builder add/edit condition and chips, panel closes on outside click and Escape; action menu and currency select open/close (mouse and touch emulation); `/debts?...` deep link with a highlighted debt, settlement and shared expense scrolls to the record; person debt detail deep link; Categories page and Group categories; Group and Account detail related transactions with pager and search.
