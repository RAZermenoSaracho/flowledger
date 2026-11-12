# Tasks

Tests follow `docs/TESTING.md`: `tests/` folder beside each source file, same base name.

## 1. Server and shared schema

- [x] 1.1 In `packages/shared/src/schemas/`, add the optional `sharedExpense` shape to `updateTransactionSchema` (TSDoc, no semantics). Verify: `schemas/tests/` cases for valid and invalid shapes pass.
- [x] 1.2 In `apps/api/src/modules/transactions/services/update.service.ts`, reject (400 on `amount`) an amount below the sum of existing participant shares, with TSDoc. Verify: `services/tests/update.service.test.ts` covers below, equal and unshared cases.
- [x] 1.3 Add a test that another user's transaction id yields not-found on update. Verify: same test file passes.

## 2. Domain utils

- [x] 2.1 Add coupled-field reducers (account to currency, transfer clears category/group/sharing, group resets category) in `apps/web/src/pages/Transactions/utils/`, and the draft type (incl. `isShared`, `sharedTitle`, `participants`) in `types/`. Verify: `utils/tests/` unit test per rule.
- [x] 2.2 Add `validate` (shared Zod schema plus transfer destination rule). Verify: unit tests for invalid amount and transfer without or equal destination.
- [x] 2.3 Add the whitelisted query-param prefill parser. Verify: unit tests for valid, unknown and invalid params.
- [x] 2.4 Add the save function: one `POST` (nested `sharedExpense` when shared) or one `PUT` (changed keys, `date` via `transactionDateRequestValue` only when changed), mapping server field errors (incl. `amount`) to the draft. Verify: unit tests for untouched date, changed date, shared create, unshared create, field-error mapping, failure leaves draft.

## 3. View and routes

- [x] 3.1 Rebuild `TransactionDetailPage` on ST-005's `FormView` (header Save/Discard, `tabs`), `EditableField`, `useFormDraft`, with Details tab and not-found state. Verify: `tests/TransactionDetailPage.test.tsx` covers direct edit without an Edit button, batch save, discard, not-found.
- [x] 3.2 Add the Sharing tab for new drafts using `RelatedList` in draft mode (editable share cell, remove, equal split, totals footer). Verify: component test covers share edit, totals, shared create payload, create failure keeps draft.
- [x] 3.3 Add the Related transactions tab (`relatedTransactions`: the viewer-owned original of a settlement, plus a participant's non-navigable origin summary) and the Related settlements tab (`relatedSettlements`: every settlement request of an original expense with counterparty, amount, requested date, status and the viewer's own settlement transaction link), each hidden when empty; provider import shown in Details. Verify: component and API integration tests cover populated, origin-summary, pending-request and hidden cases.
- [x] 3.4 Add `/transactions/new` and the `/transactions/:id/edit` redirect in `main.tsx` and routes constants. Verify: route tests cover prefill, nothing created until save, redirect, landing on the new transaction.
- [x] 3.5 Point the list add control and row edit actions at the new routes; delete `TransactionFormCard`, `TransactionEditPage` and their tests, carrying their scenarios (date preservation, DST, transfer, couplings) into view tests. Verify: `TransactionsPage.test.tsx` passes; `grep` finds no references.
- [x] 3.6 Mobile pass (stacked field and participant rows, header actions, 16px inputs). Verify: view test at narrow width plus headless check at 375px.

- [x] 3.x Move Delete into `FormView` `actions` (stored transactions only, window.confirm kept), pass `isNew` and `backLink` "Back to transactions". Verify: `tests/TransactionDetailPage.test.tsx` covers the menu delete, dismissed confirm and Cancel.


## 4. Docs

- [x] 4.1 Mark `docs/KNOWN_ISSUES.md` #017 resolved. Verify: diff shows only that item.

## 5. Verification

- [x] 5.1 `npm run typecheck`, `npm run lint`, `npm run test` pass; new exports have TSDoc. Verify: exit 0.
- [ ] 5.2 `openspec validate st007-transaction-form-view --strict` passes.
