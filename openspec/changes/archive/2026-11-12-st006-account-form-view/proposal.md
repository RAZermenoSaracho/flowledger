# Proposal

## Why

An account can only be edited through an inline form inside its expanding list row. There is no linkable account view, the type shows as a raw enum (`checking`, `credit_card`), and the row form keeps its own copy of the draft state. ST-005 provides a shared Form View; accounts are its second consumer, and later credit-card, crypto and investment sections need a place to live.

## What Changes

- **Depends on ST-005** (`st005-reusable-editable-form-view`): consumes its `useFormDraft`, `FormView` and `EditableField` by name. This change adds no shared infrastructure.
- New web route `/accounts/:id`: an Account Form View with directly editable (no Edit button; ST-005 compact header Save/Discard) name, type, identifier, currency and initial balance, saved as one batch.
- Account rows link to the view. The inline row edit form and row expansion are removed; `useAccountEditForm` is replaced by a thin `useFormDraft` adapter.
- Sync status/panel, archive/restore and delete are available in the view.
- Human-readable account type labels; `checking` is labeled to cover debit and everyday bank accounts.
- A type-section slot in the account domain lets a type add a section later without touching the shared foundation.
- No API, schema, or authorization change: the view reads the existing accounts list query and saves through the existing `PUT /accounts/:id`. Editability is unchanged (no synced-account restriction).
- Ships in the single B-004 PR to `razs_ai`, second in order after ST-005.

## Capabilities

### New Capabilities
- `account-form-view`: the account route, direct editing, actions, type labels and type-specific sections.

### Modified Capabilities

## Impact

- `apps/web`: `main.tsx`, `constants/routes.ts`, `pages/Accounts/**` (new view page, adapter hook, utils; `AccountListItem`, `AccountsPage`, `useAccountEditForm` changed or removed).
- `docs/KNOWN_ISSUES.md`: only items for this change, if any.
- Risk: archived accounts may be absent from the default list query. Mitigation: the view's lookup includes archived accounts.
