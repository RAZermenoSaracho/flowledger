# Design

## Context

Depends on ST-005 (change `st005-reusable-editable-form-view`): `useFormDraft`, `FormView` and `EditableField` are consumed by name and not redefined here. Ownership and authorization on the server stay as today (`findFirst({ id, userId })`).

## Decisions

- **Route model.** `/transactions/:id` renders the Form View for an existing transaction; `/transactions/new` renders the same view with `initial` built from query params. `/transactions/:id/edit` is `<Navigate replace to="/transactions/:id">`. One component, one draft type, so create and edit cannot drift.
- **Prefill by query params.** A transaction util parses a whitelist (`type`, `amount`, `currency`, `accountId`, `categoryId`, `groupId`, `description`, `date`) and ignores unknown or invalid values. Reload-safe and linkable, so ST-014 can build URLs. Rejected: `location.state` (lost on reload, not linkable). Prefill never creates anything.
- **Reducers.** Pure functions in `pages/Transactions/utils/` take the draft and return the next draft: account sets currency; type=transfer clears category, group and sharing; group change resets category and forces sharing. Applied via `update(fn)`. The foundation knows none of them.
- **Validation.** `validate` wraps the shared Zod transaction schema plus domain rules (transfer needs a different destination account). Save is blocked while errors exist, so an in-between state cannot be saved.
- **Single save pipeline.** One function in `pages/Transactions/utils/` (called from `save`) creates (`POST /transactions`) or updates (`PUT /transactions/:id`). Updates send only `changedKeys`; `date` goes through `transactionDateRequestValue` and is omitted unless changed, preserving stored seconds. ST-003 appends its conditional step to this function.
- **Create entry point.** The list page's add control links to `/transactions/new`; `TransactionFormCard` is deleted. Roadmap leaves keep-or-move open; B-004 architecture decisions (see st005 design.md) pick one form.
- **Create-time sharing.** The draft type includes `isShared`, `sharedTitle` and `participants`, rendered with `SharedParticipantsFields` and the existing equal-group-split logic; create sends the nested `sharedExpense` in `POST /transactions`. ST-003 reuses these fields for existing transactions.
- **#017.** `update.service.ts` throws a validation error when the new amount is below the sum of existing participant shares. Rescaling is rejected as surprising.
- **Not-found.** An id that is missing or owned by another user renders the existing not-found state (server returns not-found for both).

## Risks / Trade-offs

- Existing tests for the edit page and create card are rewritten against the view; their scenarios (date preservation, DST, transfer, couplings, cancel) must be retained.
- Unsaved-change handling is ST-005's v1 rule; nothing extra here.
