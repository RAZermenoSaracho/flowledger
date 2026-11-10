# Spec Delta

## ADDED Requirements

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
`FormView` SHALL be composition only, taking a `form` (the hook result), `header`, optional `tabs`, and `children` sections. It SHALL contain no reference to any specific model. The Save/Cancel bar SHALL appear only while the draft is dirty. It SHALL stack its buttons at mobile width and stick to the bottom of the view. It SHALL display `isSaving` and `saveError`. It SHALL accept an optional `onSave` that replaces the Save button's default `form.save`, for callers that must gather input first. Sections that are read-only or run immediate actions SHALL be plain children and SHALL NOT touch the draft.

#### Scenario: Clean draft
- **WHEN** nothing has changed
- **THEN** no Save/Cancel bar is shown

#### Scenario: Dirty draft at mobile width
- **WHEN** a field is changed at 375 CSS pixels
- **THEN** a bar with stacked Save and Cancel buttons is visible at the bottom of the view

#### Scenario: Saving and error states
- **WHEN** a save is in progress or has failed
- **THEN** the view shows a saving indicator, or the persistence error, in a consistent place

#### Scenario: Immediate-action section
- **WHEN** a child section runs its own mutation
- **THEN** the draft and Save/Cancel bar are unaffected

### Requirement: Tabs
When `tabs` is given, `FormView` SHALL render the tab list with the existing accessible tablist semantics, driven by the URL. Switching tabs SHALL keep the draft, because the page owns the hook and stays mounted. Switching tabs SHALL NOT prompt.

#### Scenario: Switch tab with edits
- **WHEN** a user edits a field, switches tab, and returns
- **THEN** the edit is still in the draft

### Requirement: Editable field activation
`EditableField` SHALL show a `display` value until activated by click, tap, Enter or Space, then render its input. It SHALL focus the first of `input, select, textarea, [data-autofocus]` inside it. Escape SHALL call `onRevert` and leave edit mode. Focus leaving the field SHALL leave edit mode and keep the draft. A field with `readOnly` SHALL stay non-editable and non-activatable. A field with `error` SHALL stay open and show the error next to the input.

#### Scenario: Keyboard activation
- **WHEN** a focused field receives Enter or Space
- **THEN** the input appears and is focused

#### Scenario: Escape reverts
- **WHEN** a user presses Escape while editing
- **THEN** the field's draft value reverts and the display returns

#### Scenario: Read-only field
- **WHEN** a field is `readOnly`
- **THEN** click, tap, Enter and Space do not open an input

#### Scenario: Field types
- **WHEN** a consumer renders a text input, a native select, a textarea or a custom control as the field's child
- **THEN** each is focused on activation and works with the draft

### Requirement: Field-level error accessibility
A field error SHALL render with `role="alert"` and be linked to the input by `aria-describedby`.

#### Scenario: Error announced
- **WHEN** a field has an error
- **THEN** the message is announced and referenced by the input

### Requirement: Unsaved-change protection
While a draft is dirty, the hook SHALL register a `beforeunload` guard and remove it when clean. The view's own Cancel and Back controls SHALL ask for confirmation, through the app's in-app confirm dialog and not `window.confirm`, when the draft is dirty and discard it only when confirmed. Blocking navigation through arbitrary in-app links is out of scope for this version and SHALL be recorded as a known issue.

#### Scenario: Close tab with edits
- **WHEN** a user closes or reloads the page with a dirty draft
- **THEN** the browser's unsaved-changes prompt appears

#### Scenario: Back with edits
- **WHEN** a user activates the view's Back control with a dirty draft
- **THEN** a confirm dialog appears, and the draft is discarded only if confirmed

#### Scenario: Clean draft
- **WHEN** the draft is clean
- **THEN** no guard or confirm appears

### Requirement: Mobile usability
Inputs inside the Form View SHALL use at least 16px text at mobile width (`text-base sm:text-sm`) so iOS does not zoom on focus. Interactive targets SHALL be at least 40px high. The form SHALL stay usable, with no horizontal page overflow, at 375 CSS pixels.

#### Scenario: Focus on iOS
- **WHEN** a field input is focused at mobile width
- **THEN** its font size is at least 16px

### Requirement: Shared code is model-free
The hook, `FormView` and `EditableField` SHALL NOT import from any page module or reference any model by name or type, and SHALL NOT branch on a model.

#### Scenario: Static check
- **WHEN** the shared files are searched for model names and page imports
- **THEN** there are none
