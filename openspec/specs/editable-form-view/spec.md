# editable-form-view Specification

## Purpose
Shared, directly editable Form View for FlowLedger records: draft state, compact header actions, URL-driven tabs, editable fields and related lists.

## Requirements

### Requirement: Draft hook lifecycle
`useFormDraft<T extends object>({ initial, validate, save })` SHALL be the only form state machine for editable records. `initial` is `T | null`, where `null` means the entity is still loading. `T` MAY contain nested values. The hook SHALL return `{ values, setField(key, value), update(fn), revertField(key), cancel(), save(), isDirty, changedKeys, isSaving, fieldErrors, saveError }`. `update(fn)` SHALL apply a pure `(draft: T) => T` reducer supplied by the caller, so domains can apply coupled-field rules while the hook knows no domain. Nothing SHALL persist until `save()`.

#### Scenario: Consumer gets the full lifecycle
- **WHEN** a consumer other than Profile supplies only `initial`, `validate` and `save`
- **THEN** it receives draft values, dirty state, cancel, validation, saving state and persistence errors without any other form code

#### Scenario: Loading
- **WHEN** `initial` is `null`
- **THEN** the form view shows a loading state and the draft is not dirty

#### Scenario: Coupled fields
- **WHEN** a caller calls `update` with a reducer that changes two fields
- **THEN** both changes land in the draft together and nothing is persisted

### Requirement: Dirty state and changed keys
A draft SHALL be dirty when any top-level key differs from `initial`, using structural equality for nested values. Setting a value back to its saved value SHALL make that key clean. `changedKeys` SHALL list the dirty keys and SHALL be passed to `save(values, changedKeys)` so callers send only changed fields.

#### Scenario: Revert by retyping
- **WHEN** a user edits a field and then types its original value back
- **THEN** the field is no longer in `changedKeys` and the draft is not dirty

#### Scenario: Nested value
- **WHEN** a nested value is replaced by a structurally equal copy
- **THEN** its key stays clean

### Requirement: Validation gates saving
`validate(values) => Record<string, string>` SHALL be supplied by the caller. While it returns any error, `save()` SHALL NOT call the caller's save function. Errors SHALL be exposed in `fieldErrors` and shown only for touched fields, next to the field.

#### Scenario: Invalid draft
- **WHEN** a user edits a field to an invalid value and activates Save
- **THEN** the save function is not called and the error appears next to that field

#### Scenario: Untouched invalid field
- **WHEN** a field the user has not touched is invalid
- **THEN** no error is shown for it

### Requirement: Batch save and persistence errors
`save(values, changedKeys) => Promise<void>` SHALL be supplied by the caller and MAY run several calls. While it runs, `isSaving` SHALL be true and a second `save()` SHALL be ignored. On success the draft SHALL rebase onto the new `initial`, and `saveError` SHALL clear. On failure the draft SHALL be kept, `saveError` SHALL hold the message, and a server error that names a field SHALL also appear in `fieldErrors` for that field.

#### Scenario: Save succeeds
- **WHEN** the save function resolves
- **THEN** the draft is clean, shows the saved values, and no error is shown

#### Scenario: Save fails
- **WHEN** the save function rejects
- **THEN** the draft and dirty state are kept, `saveError` is set, and the user can retry

#### Scenario: Field-named server error
- **WHEN** the rejection names a field
- **THEN** the message is also shown next to that field

### Requirement: Rebase rule
When `initial` changes, the draft SHALL rebase onto it only if the draft is not dirty. A dirty draft SHALL never be overwritten by a changed `initial`.

#### Scenario: Refetch while clean
- **WHEN** `initial` changes and the draft is clean
- **THEN** the draft shows the new values

#### Scenario: Refetch while dirty
- **WHEN** `initial` changes after an unrelated mutation while the draft is dirty
- **THEN** the user's edited values are kept

### Requirement: Form View composition
`FormView` SHALL be composition only, taking `title`, optional `subtitle`, `headerExtra`, `tabs`, `children`, `draft` (the hook result), optional `onSave`, optional `backLink` (`{ to, label }`), optional `isNew` and optional `actions` (record-action menu items). It SHALL contain no reference to any specific model. There SHALL be no Edit button and no edit mode. Sections that are read-only or run immediate actions SHALL be plain children and SHALL NOT touch the draft.

#### Scenario: No edit mode
- **WHEN** a Form View renders
- **THEN** no Edit button or mode toggle exists and every editable field is already an input

#### Scenario: Immediate-action section
- **WHEN** a child section runs its own mutation
- **THEN** the draft and header actions are unaffected

### Requirement: Header actions
`FormView` SHALL render compact icon Save (lucide `CloudUpload`) and Cancel (lucide `X`) buttons, followed by the options menu, in an action group at the top-right of its first header row, without any bottom bar. Save, Cancel and the options trigger SHALL be identical 36x36px squares matching the shared options-menu trigger, with the same icon size and border treatment. Each SHALL have an `aria-label` ("Save" / "Cancel"), a `title` tooltip and a visible focus ring. When a `backLink` is given it SHALL render as an icon-only back arrow (lucide `ArrowLeft`, accessible name and `title` from `label`) at the top-left of that same row, with the title, subtitle and extra content on the row beneath. Both SHALL render only while the draft is dirty. With `isNew`, Save SHALL always render (disabled until the draft is dirty and valid) while Cancel still renders only when dirty. Save SHALL be disabled, with its reason in the title and an accessible description, while `draft.isSaving` or `draft.fieldErrors` is non-empty, and SHALL show a spinner and `aria-busy` while saving. Cancel SHALL discard the draft immediately (restoring the last persisted state) without a confirm dialog. The action group SHALL be `shrink-0` and stay on a single row at every width (320 to 1440 CSS pixels) with no horizontal overflow, using one layout with no width-specific variant. `draft.saveError` SHALL show inline under the header. Ctrl/Cmd+S SHALL save when dirty and enabled, and prevent the browser default. `onSave` SHALL replace Save's default `draft.save`.

#### Scenario: Clean draft
- **WHEN** a Form View renders with a clean draft
- **THEN** neither Save nor Cancel is rendered

#### Scenario: Dirty draft
- **WHEN** a user edits a field
- **THEN** icon Save and Cancel appear, enabled when valid, and the dirty marker shows on that field

#### Scenario: Create mode
- **WHEN** `isNew` is set and the draft is clean
- **THEN** Save is rendered disabled with its reason, and Cancel is not rendered

#### Scenario: Saving
- **WHEN** a save is in progress
- **THEN** Save shows a spinner and `aria-busy` and is disabled

#### Scenario: Invalid draft
- **WHEN** the draft has field errors
- **THEN** Save is disabled and its reason names the validation problem

#### Scenario: Cancel
- **WHEN** the user activates Cancel with a dirty draft
- **THEN** the draft is restored immediately with no confirm dialog

#### Scenario: Targets and layout
- **WHEN** the view renders at 375 CSS pixels
- **THEN** Save, Cancel and the options trigger are the same 36px square and the action group stays on one row with no horizontal overflow

#### Scenario: Save shortcut
- **WHEN** the draft is dirty and the user presses Ctrl+S or Cmd+S
- **THEN** save runs once and the browser's save dialog does not open; when clean nothing runs

#### Scenario: Inline save error
- **WHEN** a save fails
- **THEN** `saveError` shows under the header, the draft is kept and Save can be retried

#### Scenario: Custom save
- **WHEN** `onSave` is given
- **THEN** Save and Ctrl/Cmd+S call it instead of `draft.save`

### Requirement: Tabs
When `tabs` (`{ id, label, badge?, content }[]`) is given, `FormView` SHALL render the tab list with accessible tablist semantics, driven by the URL. Switching tabs SHALL keep the draft, because the page owns the hook and stays mounted. Switching tabs SHALL NOT prompt.

#### Scenario: Switch tab with edits
- **WHEN** a user edits a field, switches tab, and returns
- **THEN** the edit is still in the draft

#### Scenario: Tab semantics
- **WHEN** tabs render
- **THEN** they expose `tablist`, `tab` and `tabpanel` roles with `aria-selected`, and a badge when given

### Requirement: Editable field
`EditableField` SHALL take `label`, optional `hideLabel`, `error`, `readOnly`, `display` and `onRevert`, and the control as `children`. It SHALL always render its control; there is no click-to-activate and no display/edit toggle. At rest it SHALL be styled quietly (no heavy border), with a visible hover and focus ring and a distinct dirty marker while the field is dirty. Escape inside the control SHALL call `onRevert` when the field is dirty. Blur SHALL do nothing and the draft SHALL stay. A `readOnly` field SHALL render `display` (or its value) as plain text, styled distinctly, with no input. A field with `error` SHALL show it next to the control.

#### Scenario: Always an input
- **WHEN** an editable field renders
- **THEN** its control is present and focusable without any click

#### Scenario: Escape reverts
- **WHEN** a user changes a field and presses Escape in it
- **THEN** only that field's value reverts and the dirty marker clears

#### Scenario: Blur keeps draft
- **WHEN** a user changes a field and moves focus away
- **THEN** the value and dirty state are kept

#### Scenario: Read-only variant
- **WHEN** a field is `readOnly`
- **THEN** plain text is shown with no input and distinct styling

#### Scenario: Field types
- **WHEN** a consumer renders a text input, a native select, a textarea or a custom control as the child
- **THEN** each works with the draft and the same label, error and dirty styling

### Requirement: Related list
`RelatedList<Row>` SHALL take `title`, `rows`, `rowKey`, `columns` (`{ key, header, cell(row), align? }[]`), optional `isLoading`, `error`, `emptyText`, `onAdd` with `addLabel`, `onRemove(row)` with `canRemove(row)`, and `footer`. It SHALL render a `<table>` at `sm` and above and stacked label/value rows below `sm`. Cells SHALL be render props, so an `EditableField` may sit inside a cell. Whether rows belong to the draft (the caller uses `update(fn)`) or to immediate mutations SHALL be the caller's choice, and the component SHALL hold no domain logic. New rows SHALL carry a client `tempId` until saved, and row errors SHALL use dotted `fieldErrors` keys such as `participants.2.share`. Escape in a cell SHALL revert only that cell.

#### Scenario: Responsive layout
- **WHEN** the list renders at `sm` and above, and below `sm`
- **THEN** it is a table, then stacked label/value rows, with every column's content in both

#### Scenario: States
- **WHEN** `isLoading`, `error` or an empty `rows` is set
- **THEN** a loading, error or `emptyText` block shows instead of rows, and `footer` is not shown for loading or error

#### Scenario: Add and remove
- **WHEN** `onAdd` is given, or `onRemove` with `canRemove(row)` true
- **THEN** an add button with `addLabel` shows and a remove control shows only on removable rows; each calls its callback

#### Scenario: Editable cell
- **WHEN** a column's `cell` renders an `EditableField`
- **THEN** editing it works with the caller's draft and Escape reverts only that cell

#### Scenario: Row errors
- **WHEN** `fieldErrors` holds `participants.2.share`
- **THEN** the caller can show it in that row's cell, and rows are keyed by `rowKey` (including a `tempId` before save)

#### Scenario: Footer
- **WHEN** `footer` is given and rows are shown
- **THEN** it renders after the rows

### Requirement: Field-level error accessibility
A field error SHALL render with `role="alert"` and be linked to the input by `aria-describedby`.

#### Scenario: Error announced
- **WHEN** a field has an error
- **THEN** the message is announced and referenced by the input

### Requirement: Record actions menu
`FormView` SHALL take an optional `actions` node of `ActionMenuItem`s and, when it contains at least one item, render the shared `ActionMenu` labelled "Record actions" at the right of the header after Save and Cancel. It SHALL render no menu when `actions` is absent or empty. Danger items use the `danger` variant. Confirmation semantics belong to the consumer.

#### Scenario: Actions provided
- **WHEN** a consumer passes `actions`
- **THEN** a "Record actions" menu button opens a menu listing those items

#### Scenario: No actions
- **WHEN** `actions` is undefined or empty
- **THEN** no menu button is rendered

### Requirement: Unsaved-change protection
While a draft is dirty, the hook SHALL register a `beforeunload` guard and remove it when clean. The view's back arrow SHALL ask for confirmation, through the app's in-app confirm dialog and not `window.confirm`, when the draft is dirty, and SHALL navigate and discard the draft only when confirmed. Cancel never asks. Blocking navigation through arbitrary in-app links is out of scope for this version and SHALL be recorded as a known issue.

#### Scenario: Close tab with edits
- **WHEN** a user closes or reloads the page with a dirty draft
- **THEN** the browser's unsaved-changes prompt appears

#### Scenario: Back link with edits
- **WHEN** a user activates the back link with a dirty draft
- **THEN** a confirm dialog appears, and the app navigates and discards the draft only if confirmed

#### Scenario: Back link when clean
- **WHEN** a user activates the back link with a clean draft
- **THEN** the app navigates immediately without a dialog

#### Scenario: Clean draft
- **WHEN** the draft is clean
- **THEN** no guard or confirm appears

### Requirement: Mobile usability
Inputs inside the Form View SHALL use at least 16px text at mobile width (`text-base sm:text-sm`) so iOS does not zoom on focus. Interactive targets SHALL be at least 40px high, except the header icon actions, which match the 36px options-menu trigger. The form SHALL stay usable, with no horizontal page overflow, at 375 CSS pixels.

#### Scenario: Focus on iOS
- **WHEN** a field input is focused at mobile width
- **THEN** its font size is at least 16px

### Requirement: Shared code is model-free
The hook, `FormView`, `EditableField` and `RelatedList` SHALL NOT import from any page module or reference any model by name or type, and SHALL NOT branch on a model.

#### Scenario: Static check
- **WHEN** the shared files are searched for model names and page imports
- **THEN** there are none

### Requirement: No domain logic
ST-005 SHALL contain no participant, member, holding or other domain logic. Those are consumers of `RelatedList` and `useFormDraft`.

#### Scenario: Consumer owns rows
- **WHEN** a consumer renders rows
- **THEN** its own reducers, validation and mutations decide the rows, and the shared code only renders them

### Requirement: Form View without a draft
`FormView` SHALL accept being rendered without a draft, for a record view that has nothing editable at the record level. Without a draft it SHALL render the same header, the back arrow, the tabs, the children and the record-actions menu. It SHALL NOT render Save or Cancel, SHALL NOT register the save shortcut, and its back arrow SHALL navigate without asking for confirmation. Rendering with a draft SHALL behave exactly as before.

#### Scenario: Read-only record header
- **WHEN** a record view renders `FormView` with a title and a back link but no draft
- **THEN** the back arrow and title are shown, no Save or Cancel control is rendered, and activating the back arrow navigates immediately
