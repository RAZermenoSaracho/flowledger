# Design

## Context

See proposal.md. The accounts list page loads accounts per user via `["accounts", query]`; `AccountListItem` expands inline and hosts the edit form (`useAccountEditForm`, per-field `useState`) plus archive/delete and `AccountSyncPanel`. `PUT /accounts/:id` (`updateAccountSchema`, owner-scoped in `update.service.ts`) already exists; there is no `GET /accounts/:id`. ST-005 supplies `useFormDraft`, `FormView` and `EditableField` (see `st005-reusable-editable-form-view`); this change only composes them.

## Goals / Non-Goals

- Goals: a linkable, directly editable account view; no account-owned form lifecycle; room for per-type sections.
- Non-goals: new endpoints, schema changes, synced-account edit restrictions, credit-card/crypto/investment sections (later intents), changes to shared Form View files.

## Decisions

1. **Data source: existing list query, no new endpoint.** The view finds the account by id in the accounts query (with archived included). Missing id shows not-found. The list is already user-scoped, so another user's id is indistinguishable from a missing one. Alternative: `GET /accounts/:id` -- rejected as an extra surface for no gain.
2. **Save: existing `PUT /accounts/:id`.** A domain `account.service`-side client call (`accounts.client`) is reused; the adapter sends only `changedKeys`, maps blank identifier to `null`, and invalidates `accounts` and `transactions` on success (as today). Server ownership is untouched.
3. **`useAccountForm` adapter** replaces `useAccountEditForm`: supplies `initial` (from the account, `null` while loading), `validate` (shared `updateAccountSchema.safeParse` mapped to field errors), and `save`. Archive/restore/delete become small immediate-action mutations in `useAccountActions`. The ST-005 rebase rule keeps a dirty draft safe when archive/restore refetches the list.
4. **Route `/accounts/:id`** added in `main.tsx` and `constants/routes.ts` (additive). List rows become links; the inline form and row expansion are removed, and `AccountListItem` keeps summary info (name, label, currency, badges). Alternative: keep inline edit alongside -- rejected, it duplicates the lifecycle.
5. **Type labels** in `accountDisplay.ts`: `getAccountTypeLabel(type)` over a record keyed by `AccountType` (exhaustive at compile time). `checking` reads "Checking / debit". Used by list, view and the type select.
6. **Type sections:** `AccountTypeSections` (account domain) maps `AccountType` to an optional section component; all entries are empty today. A future type adds one entry; it renders inside `FormView` children and receives the draft helpers, so no shared file changes.
7. **Editing and mobile:** fields are always-editable `EditableField`s (no Edit button) and Save/Discard are ST-005's compact `FormView` header actions; the view adds no layout of its own and no bottom bar. Sizing at 375px relies on ST-005.

## Risks / Trade-offs

- Archived accounts missing from the list query -> view uses a lookup that includes archived.
- Large account lists make find-by-id loads heavier than a single GET -> acceptable now; revisit if lists grow.
- Depends on ST-005 landing first in the same PR -> tasks start by confirming its exports.

## Migration Plan

No data or API migration. Old inline edit UI is removed in the same PR; rollback is a revert.

## Open Questions

None. Roadmap questions resolved: no synced-account restriction; inline row form and expansion are removed in favor of the link.
