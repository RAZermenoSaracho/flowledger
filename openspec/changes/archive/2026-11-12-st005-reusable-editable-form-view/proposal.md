# Proposal

## Why

FlowLedger has three hand-written form drafts (Profile, account edit, transaction edit). Only Profile has click-to-edit, dirty tracking, a persistence-error display and an unload guard, and it is welded to Profile. Accounts, Transactions and Groups are about to become directly editable records (ST-006, ST-007, ST-024), and each would copy that lifecycle. This change extracts it once, then proves it by migrating Profile onto it.

## What Changes

- Add a model-agnostic Form View foundation in the web app, in the Odoo-inspired "the input is the field" style:
  - `useFormDraft`, the only form state machine: draft, dirty keys, validation, one batch save, rebase and unload guard.
  - `FormView`, composition only: header with compact always-visible Save and Discard, optional tabs and sections.
  - `EditableField`, a quiet always-rendered control with a dirty marker, plus a plain-text read-only variant. There is no Edit button, edit mode or click-to-activate.
  - `RelatedList<Row>`, a table at `sm`+ and stacked rows on mobile, with render-prop cells, loading, empty and error states, add and remove callbacks and a footer.
- ST-005 holds no domain logic. Participants, members and holdings are consumers that choose draft or immediate rows.
- Migrate Profile onto `useFormDraft`, `FormView` and `EditableField`. `useProfileDetails` shrinks to a Profile adapter, `ProfileInlineField` and `ProfileTabs` are replaced, and Profile's scenarios are kept with its click-to-activate test selectors rewritten (no behavior loss; fields are directly editable).
- Unsaved changes are protected by a `beforeunload` guard plus a confirm on the view's own Discard/Back controls. Blocking arbitrary in-app navigation is deferred and logged in `docs/KNOWN_ISSUES.md`.
- No API, schema, database or dependency change, and no router migration.

Delivery: ships inside the single Batch B-004 pull request to `razs_ai`, **first in order** (ST-005, then ST-006, ST-007, ST-003, ST-024, ST-008). Later changes reference the contract in `editable-form-view` by name and do not re-specify it.

## Capabilities

### New Capabilities
- `editable-form-view`: the shared hook, view, field and related-list contract that model views consume.

### Modified Capabilities
- `profile-identity-layout`: Profile runs on the shared Form View: no behavior loss, fields directly editable.

## Impact

- New: `apps/web/src/hooks/useFormDraft.ts`, `components/FormView.tsx`, `components/EditableField.tsx`, `components/RelatedList.tsx`, a confirm dialog moved from Profile to `components/`, and a types file.
- Changed: `pages/Profile/` (`ProfilePage`, `useProfileDetails`, `GeneralTab`, `ProfileHeader`, `ProfileTabs`, `ProfileInlineField` removed).
- Risk: subtle Profile regressions (focus, tab-switch draft, email password prompt, avatar save). Mitigation: Profile's scenarios are kept and its tests rewritten only where selectors assumed click-to-activate.
