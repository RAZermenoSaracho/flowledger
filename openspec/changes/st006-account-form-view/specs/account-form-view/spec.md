## ADDED Requirements

### Requirement: Linkable account view

Clicking an account SHALL open that account's own view at a linkable URL (`/accounts/:id`). Only the account's owner SHALL be able to reach it; any other id, including another user's account, SHALL show the same not-found state.

#### Scenario: Open from the list
- **WHEN** a user clicks an account in the list
- **THEN** the browser navigates to `/accounts/<id>` showing that account's details

#### Scenario: Direct link
- **WHEN** the owner loads `/accounts/<id>` directly or reloads it
- **THEN** the account view renders, including for an archived account

#### Scenario: Another user's account
- **WHEN** a user opens `/accounts/<id>` for an account owned by someone else, or an id that does not exist
- **THEN** a not-found state is shown and no account data is revealed

### Requirement: Direct editing through the shared Form View

The account view SHALL let the user edit name, type, identifier, currency and initial balance directly, validated with the shared account schema, and saved together as one batch through the shared Form View lifecycle. The account domain SHALL NOT keep its own copy of that lifecycle (draft, dirty state, Save/Discard, saving and error handling).

#### Scenario: Edit without an Edit button
- **WHEN** an account view is opened
- **THEN** every editable field is a live control with no Edit button or edit mode, and typing changes the draft directly

#### Scenario: Edit and save
- **WHEN** the user changes one or more fields and presses Save
- **THEN** all changes are saved in one request and the view shows the updated values

#### Scenario: Invalid value
- **WHEN** a field value is invalid (for example an empty name)
- **THEN** the error is shown next to the field and Save is blocked

#### Scenario: Cancel
- **WHEN** the user presses Cancel with unsaved changes
- **THEN** the draft reverts to the saved values immediately

#### Scenario: Save rejected by the server
- **WHEN** the server rejects the save
- **THEN** the draft is kept and the error is displayed

### Requirement: Account actions remain available

The account view SHALL show the account's sync status and sync controls where the account is synced, and SHALL offer archive (or restore) and delete in the header "Record actions" menu. The view SHALL link back with "Back to accounts". Delete SHALL require confirmation, and after delete the user SHALL return to the accounts list.

#### Scenario: Synced account
- **WHEN** a synced account is opened
- **THEN** its sync status and sync controls are shown

#### Scenario: Archive and restore
- **WHEN** the user archives an active account, or restores an archived one
- **THEN** the account's state changes and the view reflects it without losing a dirty draft

#### Scenario: Delete
- **WHEN** the user confirms deleting the account
- **THEN** the account is removed and the user returns to the accounts list

### Requirement: Mobile usability

The account view SHALL be usable at mobile width: fields and actions are reachable without horizontal scrolling and inputs do not trigger iOS focus zoom.

#### Scenario: Narrow viewport
- **WHEN** the view is shown at 375px width
- **THEN** all fields and actions are usable without horizontal scrolling, and the header (back link, title, icon Save/Cancel, record actions menu) wraps without overflow, with no sticky bottom bar

#### Scenario: Desktop width
- **WHEN** the view is shown at desktop width
- **THEN** icon Save/Cancel sit top-right in the header and appear only while the draft is dirty

### Requirement: Type-specific fields and sections

The account view SHALL NOT force every account type to show identical fields. It SHALL show type-specific fields or sections only where a real difference exists, which today is none beyond the common fields. An account type SHALL be able to add its own section within the account domain without changing the shared Form View foundation.

#### Scenario: Types with no differences
- **WHEN** any current account type is opened
- **THEN** it shows the common fields and no type-specific section

#### Scenario: Adding a type section
- **WHEN** a type registers a section in the account domain
- **THEN** that section appears only for accounts of that type, under the same draft and Save, and no shared Form View file changes

### Requirement: Clear account type labels

Account types SHALL display human-readable labels wherever the type is shown or chosen, and the `checking` label SHALL make clear that it covers debit and everyday bank accounts.

#### Scenario: Checking label
- **WHEN** an account of type `checking` is displayed or the type is chosen
- **THEN** its label indicates checking, debit and everyday bank accounts, not the raw enum

#### Scenario: Other types
- **WHEN** any other account type is displayed
- **THEN** a readable label is shown instead of the raw enum value

### Requirement: Existing authorization and editability unchanged

Saving SHALL use the existing owner-scoped update, and no new account endpoint SHALL be introduced. Editing SHALL NOT be newly restricted for synced accounts.

#### Scenario: Save for another user's account
- **WHEN** an update targets an account the caller does not own
- **THEN** the server responds not-found and nothing changes

#### Scenario: Synced account edit
- **WHEN** the owner edits a synced account's fields
- **THEN** the save is allowed as it is today
