# Design

## Context

Depends on ST-005 (change `st005-reusable-editable-form-view`): `useFormDraft`, `FormView`, `EditableField` and `RelatedList` are consumed by name and not redefined here. Ownership and authorization on the server stay as today (`findFirst({ id, userId })`).

## Decisions

- **Route model.** `/transactions/:id` renders the Form View for an existing transaction; `/transactions/new` renders the same view with `initial` built from query params. `/transactions/:id/edit` is `<Navigate replace to="/transactions/:id">`. One component, one draft type, so create and edit cannot drift.
- **Prefill by query params.** A transaction util parses a whitelist (`type`, `amount`, `currency`, `accountId`, `categoryId`, `groupId`, `description`, `date`) and ignores unknown or invalid values. Reload-safe and linkable, so ST-014 can build URLs. Rejected: `location.state` (lost on reload, not linkable). Prefill never creates anything.
- **Reducers.** Pure functions in `pages/Transactions/utils/` take the draft and return the next draft: account sets currency; type=transfer clears category, group and sharing; group change resets category and forces sharing. Applied via `update(fn)`. The foundation knows none of them.
- **Validation.** `validate` wraps the shared Zod transaction schema plus domain rules (transfer needs a different destination account). Save is blocked while errors exist, so an in-between state cannot be saved.
- **Atomic save.** One function in `pages/Transactions/utils/` (called from `save`) issues exactly one request: `POST /transactions` (new, nested `sharedExpense` when shared) or `PUT /transactions/:id` (changed keys only; `date` via `transactionDateRequestValue`, omitted unless changed). `updateTransactionSchema` gets an optional `sharedExpense` (`{ enabled: false }` or `{ enabled: true, title?, participants: [{ id?, userId? | manualName?, share }] }`); ST-007 defines the shape and does not send it for existing transactions. ST-003 implements its diff/upsert inside the existing `prisma.$transaction`. Any failure (400/409/network) leaves the server unchanged and the draft intact, so Save is retryable; no partial state exists.
- **Create entry point.** The list page's add control links to `/transactions/new`; `TransactionFormCard` is deleted. The roadmap left keep-or-move open; one create/edit form is chosen.
- **Tabs.** Via `FormView` `tabs`: Details (fields and reducers), Sharing, Related transactions (`?tab=related`), Related settlements (`?tab=settlements`). Sharing for new drafts: shared toggle, title, participants `RelatedList` in draft mode (editable share cell, remove, equal-split helper, footer totals: allocated, owner share, unallocated), using `update(fn)`. ST-003 extends this tab for existing transactions (convert, disable, acceptance/paid columns, locks, invitation search). Related transactions: the viewer-owned original expense of a settlement (navigable) or a non-navigable origin summary for participants. Related settlements: on an original expense, every settlement request of its participants (pending, rejected and approved, oldest first) with the counterparty as public user and a link only to the viewer's own settlement transaction. Both are server-derived from `SettlementRequest`, never `TransactionRelation`, and each tab is hidden when empty. The imported-record date lives in Details. No new models.
- **#017.** `update.service.ts` throws a 400 naming `amount` when the new amount is below the sum of existing participant shares; the view maps it to the amount field. Rescaling is rejected as surprising.
- **Not-found.** An id that is missing or owned by another user renders the existing not-found state (server returns not-found for both).

## Risks / Trade-offs

- Existing tests for the edit page and create card are rewritten against the view; their scenarios (date preservation, DST, transfer, couplings, cancel) must be retained.
- Unsaved-change handling is ST-005's rule; nothing extra here.
- `sharedExpense` on update is schema-only here; until ST-003 lands in the same PR no caller sends it.
