# Spec Delta

## ADDED Requirements

### Requirement: Model list

The app SHALL show the user's notification models in the shared list experience, each with its name, an active badge, its visibility and the status of its last run, usable at mobile width.

#### Scenario: List
- **WHEN** the user opens the notification models page
- **THEN** each of their models shows name, active badge, visibility and last run status

#### Scenario: Mobile
- **WHEN** the page is opened at 375px width
- **THEN** it fits without horizontal scrolling

### Requirement: Model detail with four tabs

A model SHALL open in a detail view with four tabs, Form, Code, Playground and Logs, selected through the URL. The view SHALL use the shared form lifecycle: one draft shared by all tabs, Save and Cancel, and an unsaved-changes guard.

#### Scenario: Tab in URL
- **WHEN** the user opens the model with the Code tab in the URL
- **THEN** the Code tab is shown and reloading keeps it

#### Scenario: One draft
- **WHEN** the user edits the name on Form, switches to Code and edits code, then saves
- **THEN** both changes are saved together

#### Scenario: Unsaved guard
- **WHEN** the draft is changed and the user tries to leave
- **THEN** a confirmation is shown

#### Scenario: New model
- **WHEN** the user creates a model
- **THEN** the detail view opens with a commented template script

### Requirement: Form tab

The Form tab SHALL show the name, description, active state and visibility; the ingest endpoint URL with a copy action and setup instructions for a phone shortcut; a slot table with a binding select per slot limited to the user's own records; settings; and the model's origin and version. For a copy with an update available it SHALL offer an update action showing the current and new code, warning when the code was modified locally and asking for bindings for new required slots.

#### Scenario: Endpoint
- **WHEN** the user opens the Form tab
- **THEN** the full endpoint URL is shown with a copy action and shortcut setup instructions

#### Scenario: Binding options
- **WHEN** the user opens a binding select
- **THEN** only their own records of that slot's kind are offered

#### Scenario: Update dialog
- **WHEN** an update is available and the user chooses to update
- **THEN** current and new code are shown, a local-modification warning appears if applicable, and bindings can be chosen for new required slots

### Requirement: Code tab

The Code tab SHALL provide a Python editor with syntax highlighting and a check action that shows validation errors by line. A collapsible function reference SHALL list every helper with its signature, description and an example.

#### Scenario: Check
- **WHEN** the user runs the check on code containing `import os`
- **THEN** an error is shown with its line

#### Scenario: Reference
- **WHEN** the user expands the function reference
- **THEN** each helper shows signature, description and example

### Requirement: Playground tab

The Playground tab SHALL let the user enter notification text and run it against the unsaved draft code and settings. It SHALL show the outcome, the transaction preview, the reason or error with its line, and printed output, and SHALL state that nothing is created.

#### Scenario: Run draft
- **WHEN** the user edits code without saving and runs the playground
- **THEN** the result reflects the edited code

#### Scenario: Result shown
- **WHEN** the run produces a proposal
- **THEN** the transaction preview is shown with a notice that nothing is created

#### Scenario: Error shown
- **WHEN** the script fails
- **THEN** the error message, line and printed output are shown

### Requirement: Logs tab

The Logs tab SHALL show the model's run history, read-only and paginated, with received time, status, reason, a link to the transaction when one exists, and the notification text only while it is retained.

#### Scenario: History
- **WHEN** the user opens Logs
- **THEN** runs appear newest first with a transaction link where one exists

#### Scenario: Cleared text
- **WHEN** a run's text has been cleared
- **THEN** the entry shows no text

### Requirement: Library page

A library page SHALL let the user browse public models, view their code, and install one. Installing SHALL open the new copy's Form tab, prompting for bindings.

#### Scenario: Install flow
- **WHEN** the user installs a library model
- **THEN** the new copy's Form tab opens prompting for slot bindings

### Requirement: Publish confirmation

Publishing SHALL ask for confirmation listing exactly what will be published: name, description, code, slots and settings, and stating that bindings are not.

#### Scenario: Confirm
- **WHEN** the user chooses to publish
- **THEN** the dialog lists the published fields and publishing happens only after confirming

### Requirement: Ingest-only key creation

The API-key creation dialog SHALL offer "Notification ingest only" and show the created key once.

#### Scenario: Create ingest key
- **WHEN** the user creates a key with "Notification ingest only"
- **THEN** the key is shown once and the key list marks it as ingest

### Requirement: Mobile usability

All notification model pages SHALL be usable at 375px width.

#### Scenario: Narrow width
- **WHEN** any of the list, detail tabs and library page is opened at 375px
- **THEN** content fits without horizontal page scrolling and actions remain reachable
