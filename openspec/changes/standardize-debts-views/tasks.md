# Tasks

## 1. Shared foundations

- [x] 1.1 Make `FormView`'s `draft` optional: with no draft, hide Save and Cancel, skip the save shortcut, and let the back link navigate without the dirty guard. Verify that `components/tests/FormView.test.tsx` covers the no-draft case and that the existing cases still pass.
- [x] 1.2 Add the `shared=1` prefill (`isShared: true`) to `transactionPrefill.ts`. Verify with `utils/tests/transactionPrefill.test.ts`, which must also check that `shared=0` and `shared=yes` are ignored.
- [x] 1.3 Make the `TransactionDetailPage` back arrow use a safe `location.state.from` (app-relative only) with a fallback to `/transactions`, and keep that state through the post-create redirect. Verify with `tests/TransactionDetailPage.test.tsx`, covering the from-state case, the unsafe-value case and the fallback case.

## 2. Debts tabs

- [x] 2.1 Pass `isLoading` and `error` from `DebtsPage` to the Balances, Pending, Settled and Awaiting lists, and remove the page-level loading and error lines. Verify with the updated `DebtsPage.test.tsx` and the per-tab tests.
- [x] 2.2 Rebuild `AwaitingAcceptanceTab` on `ListView` `groups` with `RecordCard` rows. Keep Accept, Reject, Reject-and-block, the highlight and the "no longer awaiting" message, and link row titles to the Shared Expense view. Verify with `components/tests/AwaitingAcceptanceTab.test.tsx`.
- [x] 2.3 Render `PersonDebtDetailPage` through `FormView` with no draft: the person's name as the title and the back arrow to `/debts?tab=balances` labelled "Back to balances". Move the name out of `PersonDebtDetail`'s summary card without changing its other content. Verify with `tests/PersonDebtDetailPage.test.tsx`, covering the back arrow, settlement submit and batch submit.
- [x] 2.4 Make `DebtTable` pass the visible row ids to `selection.toggle`. Verify with `components/tests/DebtTable.test.tsx`.

## 3. Shared Expenses

- [x] 3.1 Add `getSharedExpense(id)` to `services/sharedExpenses.client.ts` and remove the unused `createSharedExpense`. Verify with typecheck.
- [x] 3.2 Rewrite `hooks/useSharedExpenseForm.ts` as a `useFormDraft` adapter over `{ title, status }` that saves only the changed keys and invalidates the related queries. Verify with `hooks/tests/useSharedExpenseForm.test.tsx`.
- [x] 3.3 Add `SharedExpenseDetailPage` at `/debts/shared-expenses/:id` (route constant plus `main.tsx`):
  - General tab
  - Participants tab (`RelatedList`)
  - owner-only actions "Manage participants" and "Open transaction", passing `state.from`
  - read-only rendering for participants
  - the not-found state

  Verify with `tests/SharedExpenseDetailPage.test.tsx`, covering owner save, participant read-only, the actions, the back arrow and not-found.
- [x] 3.4 Make Shared Expenses rows `Link`s to the record view and drop the Edit action. Point "Add shared expense" at `/transactions/new?shared=1&tab=sharing`. Delete `SharedExpenseFormCard` and its test, and drop any page-local types that are now unused. Verify with the updated `SharedExpensesPage`, `SharedExpensesListCard` and `SharedExpenseListItem` tests.

## 4. Validation and delivery

- [x] 4.1 Run `npm run typecheck`, `npm run lint`, the web test suite, `npm run build` and `openspec validate standardize-debts-views --strict`. All must pass.
- [x] 4.2 Add `database/qa/debtsUiQa.ts`, an idempotent staging-only seed and cleanup for `[UI QA]` Debts records driven through the staging API, plus `docs/qa/DEBTS_UI_QA.md`, the manual QA guide with direct links. Verify that a second run creates nothing new.
- [x] 4.3 Commit, push, open a PR against `razs_ai`, deploy to staging, seed, and smoke-test every Debts view in the browser. Verify that all scenarios in the QA guide render without console errors.
