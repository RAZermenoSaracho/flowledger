# Tasks

Prerequisite: `st007-transaction-form-view` is implemented (draft type, reducers, save function, view).

## 1. Server

- [ ] 1.1 Map the unique `SharedExpense.transactionId` conflict in `shared-expenses/services/create.service.ts` to a 409 "This transaction is already shared". Verify: `services/tests/create.service.test.ts` covers the second-conversion case and another user's transaction returning not-found.

## 2. Draft and pipeline

- [ ] 2.1 Extend ST-007's `validate`, reusing its `isShared`, `sharedTitle` and `participants` draft fields, (transfer not shareable, shares within amount, title and participant required). Verify: utils tests for each rule pass.
- [ ] 2.2 Add the conditional `POST /shared-expenses` step to ST-007's save function, with partial-failure handling (refetch, keep draft, retry only the sharing step). Verify: save-function tests cover success, sharing failure, retry without duplicate, and no step when already shared.

## 3. View

- [ ] 3.1 Enable ST-007's existing sharing controls for existing, not-yet-shared transactions, and render participants read-only when a shared expense exists. Verify: `TransactionDetailPage.test.tsx` additions cover conversion at mobile and desktop widths, transfer rejection, shares over amount, read-only participants, and the 409 message.
- [ ] 3.2 Verify list and debts. Verify: a test or integration check confirms a converted transaction shows as shared in the list and creates the expected debt and notifications.

## 4. Docs

- [ ] 4.1 In `docs/KNOWN_ISSUES.md`, note on #019 that conversion leaves it unchanged. Verify: diff touches only #019.

## 5. Verification

- [ ] 5.1 `npm run typecheck`, `npm run lint`, `npm run test` pass; new exports have TSDoc. Verify: exit 0.
- [ ] 5.2 Headless-browser conversion check at 375px and desktop width. Verify: transaction appears shared in list and debts.
- [ ] 5.3 `openspec validate st003-convert-transaction-to-shared --strict` passes.
