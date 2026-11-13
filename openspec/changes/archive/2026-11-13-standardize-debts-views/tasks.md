# Tasks

## 1. Shared foundations

- [x] 1.1 Make `FormView`'s `draft` optional: with no draft, hide Save and Cancel, skip the save shortcut, and let the back link navigate without the dirty guard. Verify that `components/FormView/tests/FormView.test.tsx` covers the no-draft case and that the existing cases still pass.
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

## 5. Staging review fixes

- [x] 5.1 Render the person balance detail as `Card` → `FormView`, so the back arrow and title sit inside the card, and drop `PersonDebtDetail`'s own outer `Card`. Verify that `PersonDebtDetailPage.test.tsx` asserts one card containing the header and the debt tables, and that the settlement tests still pass.
- [x] 5.2 Pass Accept, Reject and Reject-and-block to `RecordCard` `actions` in Awaiting Acceptance, so they show inline on the right when they fit and in the card's three-dot menu otherwise. Verify with `AwaitingAcceptanceTab.test.tsx`: the menu has the three actions, owner rows have no menu, and the requests are unchanged.
- [x] 5.3 Turn Pending Settlement Requests into two shared `Tabs` ("Requests by me", "Awaiting my approval") with count badges and a `?pending=` URL param. A highlighted request opens its own tab. Verify with `PendingRequestsTab.test.tsx`: one list at a time, switching, default rules, approve and batch approve still work.
- [x] 5.4 Re-run typecheck, lint, the web suite, the build and strict validation. Redeploy staging, run the desktop and mobile smoke, check the QA dataset is intact, and update the PR #50 description.

## 6. FormView component directory

- [x] 6.1 Move `components/FormView/FormView.tsx` and its test into `components/FormView/`, with an `index.ts` exporting only `FormView`, and extract the private `FormViewHeader` with identical DOM. Verify that consumers compile unchanged through the index, that the FormView tests pass and that `FormViewHeader.test.tsx` is added.
- [x] 6.2 Update the references in `apps/web/CLAUDE.md` and `docs/KNOWN_ISSUES.md`, run the regression tests for every FormView consumer (Accounts, Transactions, Groups, Profile, Debts, Shared Expenses), the full gates and a simplicity review, then redeploy staging and smoke-test it with the QA dataset intact.

## 7. Final review improvements

- [x] 7.1 Extract `pages/Debts/hooks/useDebtsData.ts` (queries under their original keys, private category filters, `groupById`, one settlement workflow per page) for `DebtsPage` and `PersonDebtDetailPage`, resolving known issue #050. Verify with `hooks/tests/useDebtsData.test.tsx` and that the Debts tests pass.
- [x] 7.2 Give the shared `Tabs` a `buttons` variant (shared `Button`, primary when selected) plus the `desktopOnly` and `label` props, and use it for the desktop section strips of Transactions and Debts, resolving #051. Mobile keeps the sidebar submenus. Verify with the Tabs and page tests and a desktop and mobile smoke.
- [x] 7.3 Render the Awaiting Acceptance Accept action as the primary `Button`, through a new `primary` `RecordCardAction` variant.
