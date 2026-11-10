# Spec Delta

## ADDED Requirements

### Requirement: Profile runs on the shared Form View
Profile SHALL use `useFormDraft`, `FormView` and `EditableField` from `editable-form-view`, and SHALL NOT keep its own copy of the draft, dirty, save, cancel, error or unload-guard lifecycle. `useProfileDetails` SHALL supply only Profile's `initial`, `validate` and `save` plus its display helpers. The save SHALL keep the sequence email, then profile, then avatar. The avatar file SHALL be a field of the draft, so choosing one makes the draft dirty and Save uploads it. The email-change password prompt SHALL remain, opened through the view's `onSave`. Preferences, Security and Subscription tabs SHALL keep their own independent mutations. `GeneralTab` SHALL keep an open children area below its details.

#### Scenario: No behavior loss
- **WHEN** a user edits name, email or currency, picks an avatar, switches tabs, cancels or saves
- **THEN** each field is directly editable with no Edit button, and every pre-migration capability remains, including the draft surviving tab switches and the avatar uploading on Save

#### Scenario: Email change
- **WHEN** a user saves a changed email
- **THEN** the current-password prompt appears before any change is sent

#### Scenario: Section appended to General
- **WHEN** another change adds a child section to `GeneralTab`
- **THEN** it renders below the existing details without touching the draft
