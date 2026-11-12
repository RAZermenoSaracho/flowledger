# Proposal

## Why

`/transactions/:id` is read-only with an Edit button, and `/transactions/:id/edit` is a separate 362-line form that re-implements fields the create card already shares through `TransactionCoreFields`. The coupled-field rules (account sets currency, transfer clears category/group/sharing, group resets category) are repeated in inline handlers, so create and edit can drift. Creation exists only as an inline card on the list page, with no way to open a prefilled draft (ST-014 needs one).

ST-005 provides the shared form foundation (`useFormDraft`, `FormView` with compact header actions and tabs, `EditableField`, `RelatedList`). This change moves transactions onto it.

## What Changes

- `/transactions/:id` becomes the editable Transaction Form View on ST-005's `useFormDraft` / `FormView` / `EditableField` / `RelatedList`. No Edit button or edit mode; Save and Discard are ST-005's compact header actions.
- Tabs: Details, Sharing, Related transactions and Related settlements. ST-007 owns the shell, Details, the two Related tabs (viewer-scoped, settlement-chain derived; each hidden when empty) and Sharing for new drafts. ST-003 extends Sharing for existing transactions.
- `/transactions/:id/edit` redirects to `/transactions/:id`.
- New `/transactions/new` opens an unsaved draft, optionally prefilled from whitelisted query params. Nothing is created until Save.
- The list page's create entry point navigates to `/transactions/new`. The inline `TransactionFormCard` create card and the separate `TransactionEditPage` are retired, leaving one create/edit form.
- Coupled-field rules become pure reducers in `pages/Transactions/utils/`, applied through the draft's `update(fn)` for both new and existing transactions.
- One transaction-domain save function builds a single request (changed fields only, date via `transactionDateRequestValue`): `POST /transactions` for new drafts, `PUT /transactions/:id` for existing. `updateTransactionSchema` gains an optional `sharedExpense` field; ST-003 implements its existing-transaction semantics, so saves are atomic and a failure leaves the server unchanged.
- Server: `updateTransaction` rejects (400, mapped to the amount field) an amount below the sum of existing shares (resolves KNOWN_ISSUES #017).
- No database migration, no new dependency, no change to authorization.

Ships in the single B-004 PR to `razs_ai`: third, after ST-005 and ST-006, with ST-003 immediately after.

## Capabilities

### New Capabilities
- `transaction-form-view`: direct-edit tabbed transaction view, new-draft route with prefill, create-time sharing, coupled-field rules, atomic save contract, #017 guard.

### Modified Capabilities

None. `transaction-datetime` is referenced, not changed: its edit-form requirements are met by the new view unchanged.

## Impact

- Web: `main.tsx` and routes constants, `pages/Transactions/` (detail page rewritten, `TransactionEditPage` and `TransactionFormCard` removed, new utils), `TransactionsPage.tsx`.
- API: `transactions/services/update.service.ts` plus its test.
- Docs: `docs/KNOWN_ISSUES.md` (#017 resolved).
- Risk: removing the inline card changes the list-page create flow; mitigated by carrying over its existing test scenarios to the new view.
