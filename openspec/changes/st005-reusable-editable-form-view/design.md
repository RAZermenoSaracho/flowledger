# Design

## Context

- Draft state is hand-written in `useProfileDetails.ts`, `useAccountEditForm.ts` and `TransactionEditPage.tsx`. Only Profile has click-to-edit, dirty tracking, a persistence-error display and the `beforeunload` guard.
- `ProfileInlineField.tsx` is model-free but only focuses `input,select`. `ProfileTabs.tsx` has an accessible, URL-driven tablist hardcoded to Profile's tabs.
- `useProfileDetails` mixes generic parts (draft diff, cancel, saving and error state, guard, validation gating) with Profile parts (name and email rules, avatar preview, display helpers, the email-first save and its password prompt).
- `main.tsx` uses `BrowserRouter`, so React Router's `useBlocker` is unavailable. The web app has TanStack Query and no form library.
- `ProfileHeader`, `ProfilePage`, `ProfileInlineField` and `GeneralTab` tests pin the current behavior.

## Goals / Non-Goals

**Goals:** one contract (`editable-form-view`) that ST-006, ST-007, ST-003 and ST-024 reference by name; Profile as its first consumer with no UX change.

**Non-Goals:** a schema-driven engine, field DSL, plugin registry, form library, second data layer, or any `if (model === ...)` in shared code. No data-router migration, no new dependency, no API change. Account, Transaction, Group and metrics work belongs to their own changes. ST-008 appends a read-only section to `GeneralTab`, so `GeneralTab` keeps a plain children area and this change must not remove it.

## Decisions

- **Files.** `apps/web/src/hooks/useFormDraft.ts`, `components/FormView.tsx`, `components/EditableField.tsx`, each with a sibling `tests/` file. Their named types go in `src/types/common.types.ts`, because they are cross-cutting and owned by no API client (see `apps/web/CLAUDE.md`).
- **`useFormDraft<T extends object>({ initial, validate, save })`** returns `{ values, setField, update, revertField, cancel, save, isDirty, changedKeys, isSaving, fieldErrors, saveError }`.
  - `initial: T | null`; `null` means loading.
  - `update(fn)` is the only way domains express coupled-field rules: a pure reducer from the domain's `utils/`. The hook knows nothing about it.
  - Dirty is per top-level key against `initial`, with structural equality for nested values. `changedKeys` is handed to `save` so callers send only changed fields.
  - `validate` is a domain function wrapping a shared Zod `safeParse` plus domain rules. A non-empty result blocks save. Errors are exposed per touched field.
  - **Rebase rule:** when `initial` changes, the draft rebases only if clean. A dirty draft is never clobbered. This is what lets immediate-action sections refetch safely.
  - On success the draft rebases onto the new `initial`. On failure it is kept and `saveError` is set. A server error naming a field also maps into `fieldErrors`.
  - No `extraDirty`: Profile's avatar `File` is a field of `T`. Structural equality treats a `File` by identity.
- **`FormView`** takes `form`, `header`, optional `tabs`, `children` and optional `onSave`. The Save/Cancel bar shows only while dirty, stacked and sticky at the bottom on mobile. `onSave` exists because Profile must open its password prompt before saving; the default is `form.save`. Read-only and immediate-action sections are plain children.
- **`EditableField`** is `ProfileInlineField` generalized: `display`, `error`, `readOnly`, `onRevert`, focus on `input, select, textarea, [data-autofocus]`. Keyboard behavior is kept (Enter and Space activate, Escape reverts, blur exits).
- **Tabs.** `ProfileTabs` becomes a generic tab list taking a `tabs` prop, URL-driven as today. The page owns the hook, so tab switches never prompt.
- **Unsaved changes (v1).** `beforeunload` inside the hook while dirty, plus an in-app confirm on the view's own Cancel and Back controls. The dialog is the existing Profile `ModalDialog`, moved to `components/` so shared code does not import from a page. Route-level blocking is deferred to `docs/KNOWN_ISSUES.md`, since it needs a data router.
- **A11y and responsive.** Inputs use `text-base sm:text-sm`, targets are at least 40px, errors are `role="alert"` linked by `aria-describedby`, and native selects are kept (`select-dropdowns`).
- **Profile adapter.** `useProfileDetails` keeps the user query and display helpers, and calls `useFormDraft` with Profile's `initial`, `validate` and `save`. The save runs email, then profile, then avatar. The password prompt state stays in the adapter. Its Save handler is passed as `onSave`: if the email changed it opens the prompt, otherwise it calls `form.save()`. Confirming stores the password and calls `form.save()`.
- **Alternative rejected:** a form library (react-hook-form). It would add a dependency and still need the dirty, rebase and batch-save rules.

## Risks / Trade-offs

- [Profile regression in focus, tab drafts, email prompt or avatar save] → keep the existing tests green and extend them, not rewrite them.
- [Avatar `File` equality] → treated by identity, so choosing a new file is dirty and clearing it is clean.
- [In-app link clicks lose edits silently] → accepted for v1 and logged. `beforeunload` plus the explicit controls cover the common cases.
- [Contract grows speculatively] → it only grows when a real consumer needs it.

## Migration Plan

Land first in the B-004 PR, before ST-006. Rollback is reverting the commit; nothing server-side changes.
