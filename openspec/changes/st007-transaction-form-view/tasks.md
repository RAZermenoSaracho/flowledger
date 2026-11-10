# Tasks

## 1. Server

- [ ] 1.1 In `apps/api/src/modules/transactions/services/update.service.ts`, reject an amount below the sum of existing participant shares, with TSDoc. Verify: `services/tests/update.service.test.ts` covers below, equal and unshared cases and passes.
- [ ] 1.2 Add a test that another user's transaction id still yields not-found on update. Verify: same test file passes.

## 2. Domain utils

- [ ] 2.1 Add coupled-field reducers (account to currency, transfer clears category/group/sharing, group resets category) in `apps/web/src/pages/Transactions/utils/`, with the transaction draft type in `types/`. Verify: `utils/tests/` unit tests for each rule pass.
- [ ] 2.1b Define `isShared`, `sharedTitle` and `participants` in the transaction draft type, and have the save function send the nested `sharedExpense` in `POST /transactions` on create. Verify: unit tests cover a shared create payload and an unshared create without it.
- [ ] 2.2 Add the `validate` function (shared Zod schema plus transfer destination rule). Verify: unit tests cover invalid amount and transfer without or equal destination.
- [ ] 2.3 Add the query-param prefill parser with whitelist. Verify: unit tests cover valid, unknown and invalid params.
- [ ] 2.4 Add the single save function: create or update, changed keys only, `date` via `transactionDateRequestValue` only when changed. Verify: unit tests cover untouched date, changed date, create, and server field-error mapping.

## 3. View and routes

- [ ] 3.1 Rebuild `TransactionDetailPage` as the Form View using ST-005's `useFormDraft` / `FormView` / `EditableField`, with not-found state and `SharedParticipantsFields` for create-time sharing on `/transactions/new`. Verify: `tests/TransactionDetailPage.test.tsx` covers direct edit, batch save, cancel, not-found.
- [ ] 3.2 Add `/transactions/new` and the `/transactions/:id/edit` redirect in `main.tsx` and routes constants. Verify: route tests cover prefill, nothing created until save, redirect, and landing on the new transaction after save.
- [ ] 3.3 Point the list page's add control and row edit actions at the new routes; delete `TransactionFormCard`, `TransactionEditPage` and their tests, carrying their scenarios (date preservation, DST, transfer, couplings) into the view tests. Verify: `TransactionsPage.test.tsx` passes; no references remain (`grep`).
- [ ] 3.4 Mobile layout pass (stacked fields, sticky Save bar, 16px inputs). Verify: view test at narrow width plus a headless-browser check at 375px.

## 4. Docs

- [ ] 4.1 Mark `docs/KNOWN_ISSUES.md` #017 resolved. Note #019 is unchanged (owned by ST-003's note). Verify: file diff shows only these items.

## 5. Verification

- [ ] 5.1 `npm run typecheck`, `npm run lint`, `npm run test` pass; all new exports have TSDoc. Verify: commands exit 0.
- [ ] 5.2 `openspec validate st007-transaction-form-view --strict` passes.
