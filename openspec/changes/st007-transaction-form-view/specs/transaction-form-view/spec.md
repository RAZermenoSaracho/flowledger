# Spec Delta

## ADDED Requirements

### Requirement: Transaction fields edit directly

The transaction view at `/transactions/:id` SHALL let the user edit its fields in place on the shared Form View foundation, with no Edit button and no separate edit mode. Changes SHALL be saved together as one batch, and Save and Cancel SHALL appear only while the draft differs from the stored transaction.

#### Scenario: Edit without entering a mode
- **WHEN** a user opens a transaction and changes its description
- **THEN** the field is editable immediately and no Edit button exists
- **AND** Save and Cancel appear

#### Scenario: Batch save
- **WHEN** the user changes the description and the category and saves
- **THEN** one update request carries both fields

#### Scenario: Cancel
- **WHEN** the user changes a field and cancels
- **THEN** the stored values are shown and Save and Cancel disappear

#### Scenario: Another user's transaction
- **WHEN** a user opens `/transactions/:id` for a transaction owned by someone else
- **THEN** the not-found state is shown and no data is exposed

### Requirement: Existing validation and business rules hold

The view SHALL enforce every validation and business rule enforced by the current create and edit forms, including the field couplings below. A transaction SHALL NOT be savable in an invalid in-between state, and when a rule fails the view SHALL show the error on the offending field.

#### Scenario: Transfer without destination
- **WHEN** the user selects type transfer and leaves the destination account empty or equal to the source
- **THEN** Save is blocked and an error is shown on the destination field

#### Scenario: Invalid amount
- **WHEN** the user enters an amount that fails the shared schema
- **THEN** Save is blocked and an error is shown on the amount field

#### Scenario: Server rule failure
- **WHEN** the server rejects a save with an error naming a field
- **THEN** the draft is kept and the error shows on that field

### Requirement: Coupled fields follow domain rules

Field couplings SHALL be implemented as pure functions owned by the Transactions page and used by both the new-draft and existing-transaction views.
- Choosing an account SHALL set the transaction currency from that account.
- Choosing type transfer SHALL clear category, group and sharing, and SHALL require a destination account different from the source.
- Changing group SHALL reset the category and force sharing to match the group rule.

#### Scenario: Account sets currency
- **WHEN** the user selects an account whose currency is EUR
- **THEN** the transaction currency becomes EUR

#### Scenario: Transfer clears related fields
- **WHEN** the user changes the type to transfer on a transaction with category, group and sharing set
- **THEN** category, group and sharing are cleared

#### Scenario: Group change resets category
- **WHEN** the user changes the group
- **THEN** the category is reset and sharing follows the group rule

### Requirement: Saving keeps the stored execution time

Saving a transaction SHALL send `date` only when the user changed the date and time field, so saving other fields never overwrites the stored execution instant. Date and time behavior otherwise SHALL follow the `transaction-datetime` capability.

#### Scenario: Other field saved
- **WHEN** a transaction stored as `2026-05-31T21:33:15.979Z` has only its description changed and saved
- **THEN** the update request contains no `date`
- **AND** the stored instant is unchanged

#### Scenario: Date changed
- **WHEN** the user at UTC-6 changes the field to June 2, 2026, 3:33 PM and saves
- **THEN** the request sends `2026-06-02T21:33:15.979Z`

### Requirement: Legacy edit links redirect

A request for `/transactions/:id/edit` SHALL redirect to `/transactions/:id`.

#### Scenario: Old edit link
- **WHEN** a user opens a saved `/transactions/abc/edit` link
- **THEN** the browser lands on `/transactions/abc` showing the editable view

### Requirement: New transaction drafts open at their own URL

`/transactions/new` SHALL open an unsaved draft that creates nothing until the user saves. Initial values MAY be supplied through whitelisted query parameters; unknown or invalid parameters SHALL be ignored. The list page's add control SHALL open this route, and the inline create card SHALL no longer exist. A new draft SHALL default the date and time to now.

#### Scenario: Prefilled draft
- **WHEN** a user opens `/transactions/new?type=expense&amount=25&description=Lunch`
- **THEN** the draft shows those values and no transaction exists yet

#### Scenario: Leave without saving
- **WHEN** the user cancels or navigates away from a prefilled draft
- **THEN** no transaction is created

#### Scenario: Save creates one transaction
- **WHEN** the user saves a valid new draft
- **THEN** one transaction is created and the user lands on its `/transactions/:id` view

#### Scenario: Invalid parameter ignored
- **WHEN** the URL carries an unknown parameter or `amount=abc`
- **THEN** that value is ignored and the form opens with defaults for it

#### Scenario: Create from the list
- **WHEN** the user activates the add control on the transactions list
- **THEN** the app opens `/transactions/new`

### Requirement: New drafts keep create-time sharing

`/transactions/new` SHALL keep today's create-time sharing: the existing `SharedParticipantsFields` controls and equal-group-split logic, with draft fields `isShared`, `sharedTitle` and `participants`. Saving a shared draft SHALL send the nested `sharedExpense` payload in `POST /transactions`. No new endpoint SHALL be introduced.

#### Scenario: Create a shared transaction
- **WHEN** a user enables sharing on a new draft, adds a participant and saves
- **THEN** one `POST /transactions` carries the `sharedExpense` payload and the transaction is created shared

### Requirement: View works at mobile width

The transaction view and new-draft view SHALL be fully usable at mobile width, with fields, errors and the Save/Cancel bar reachable without horizontal scrolling.

#### Scenario: Mobile edit and save
- **WHEN** a user edits and saves a transaction at 375px width
- **THEN** every field is operable and Save is reachable

### Requirement: Amount cannot drop below existing shares

`updateTransaction` SHALL reject an amount lower than the sum of the transaction's existing participant shares, on the web API, `/v1`, and MCP.

#### Scenario: Amount below shares
- **WHEN** a transaction shared with participant shares totalling 60 is updated to amount 50
- **THEN** the request is rejected with a validation error and the stored amount and shares are unchanged

#### Scenario: Amount at or above shares
- **WHEN** the same transaction is updated to amount 60
- **THEN** the update succeeds
