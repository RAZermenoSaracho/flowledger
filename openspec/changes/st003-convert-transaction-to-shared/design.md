# Design

## Context

Builds on ST-007 (`st007-transaction-form-view`), which owns the view, reducers, `useFormDraft` wiring and the single save function. ST-005's `useFormDraft` / `FormView` / `EditableField` are consumed by name. ST-003 adds no second form state machine and no second mutation pipeline.

## Decisions

- **Draft fields.** ST-007 defines `isShared`, `sharedTitle`, `participants` and the controls; ST-003 reuses them. ST-007's group reducer already forces sharing for group transactions; ST-003 adds validation for existing transactions: transfers cannot be shared, participant shares must not exceed the amount, a title and at least one participant when `isShared`.
- **Save step.** In ST-007's save function: `PUT /transactions/:id` first, then, only when `isShared` was newly enabled and the loaded transaction has no shared expense, `createSharedExpense({ transactionId, title, participants })` via the existing client. Both steps return through the one `save`, so the hook's success/failure handling applies unchanged.
- **Partial failure.** If the PUT succeeds and POST fails: refetch the transaction (so the saved fields rebase), keep the sharing fields in the draft, set `saveError`. The save function detects the already-applied PUT (no remaining changed transaction fields after refetch) and retries only the POST.
- **Already shared.** When the loaded transaction has a shared expense, participants render read-only; no sharing step runs. Existing `updateSharedExpense` replaces participants and loses `paidAmount`, which is a further reason not to expose editing.
- **Server 409.** `SharedExpense.transactionId` is unique. `createSharedExpense` maps that conflict to a 409 with a clear message ("This transaction is already shared"); the web shows it as the save error. No schema change.
- **Authorization.** Unchanged: `getOwnedTransaction` scopes by `userId`; another user's transaction yields not-found.
- **Debts and notifications.** Derived dynamically from participants and created by the existing service, so no recompute step is added.
- **#019.** Not fixed; the picker and server rules are those of creation today.

## Risks / Trade-offs

- A retry after partial failure depends on the refetch completing; if it fails, the user retries Save and the existing-shared check prevents a duplicate (the 409 is the backstop).
