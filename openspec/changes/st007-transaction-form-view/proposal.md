# Proposal

## Why

`/transactions/:id` is read-only with an Edit button, and `/transactions/:id/edit` is a separate 362-line form that re-implements fields the create card already shares through `TransactionCoreFields`. The coupled-field rules (account sets currency, transfer clears category/group/sharing, group resets category) are repeated in inline handlers, so create and edit can drift. Creation exists only as an inline card on the list page, with no way to open a prefilled draft (ST-014 needs one).

ST-005 provides the shared form foundation (`useFormDraft`, `FormView`, `EditableField`). This change moves transactions onto it.

## What Changes

- `/transactions/:id` becomes the editable Transaction Form View on ST-005's `useFormDraft` / `FormView` / `EditableField`. No Edit button or edit mode.
- `/transactions/:id/edit` redirects to `/transactions/:id`.
- New `/transactions/new` opens an unsaved draft, optionally prefilled from whitelisted query params. Nothing is created until Save.
- The list page's create entry point navigates to `/transactions/new`. The inline `TransactionFormCard` create card and the separate `TransactionEditPage` are retired, leaving one create/edit form.
- Coupled-field rules become pure reducers in `pages/Transactions/utils/`, applied through the draft's `update(fn)` for both new and existing transactions.
- One transaction-domain save function builds the request (changed fields only, date via `transactionDateRequestValue`) and is the single pipeline ST-003 extends.
- Server: `updateTransaction` rejects an amount below the sum of existing shares (resolves KNOWN_ISSUES #017).
- No database migration, no new dependency, no change to authorization.

Ships in the single B-004 PR to `razs_ai`: third, after ST-005 and ST-006, with ST-003 immediately after.

## Capabilities

### New Capabilities
- `transaction-form-view`: direct-edit transaction view, new-draft route with prefill, coupled-field rules, single save pipeline.

### Modified Capabilities

None. `transaction-datetime` is referenced, not changed: its edit-form requirements are met by the new view unchanged.

## Impact

- Web: `main.tsx` and routes constants, `pages/Transactions/` (detail page rewritten, `TransactionEditPage` and `TransactionFormCard` removed, new utils), `TransactionsPage.tsx`.
- API: `transactions/services/update.service.ts` plus its test.
- Docs: `docs/KNOWN_ISSUES.md` (#017 resolved).
- Risk: removing the inline card changes the list-page create flow; mitigated by carrying over its existing test scenarios to the new view.
