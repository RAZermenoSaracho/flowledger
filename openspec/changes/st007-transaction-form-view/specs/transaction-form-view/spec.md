# Spec Delta

## ADDED Requirements

### Requirement: Transaction fields edit directly

The transaction view at `/transactions/:id` SHALL let the user edit its fields in place on the shared Form View foundation, with no Edit button and no separate edit mode. Changes SHALL be saved together as one batch through the compact Save and Discard controls in the header actions, which are enabled only while the draft differs from the stored transaction.

#### Scenario: Edit without entering a mode
- **WHEN** a user opens a transaction and changes its description
- **THEN** the field is editable immediately and no Edit button exists
- **AND** the header Save and Discard controls become enabled

#### Scenario: Batch save
- **WHEN** the user changes the description and the category and saves
- **THEN** one update request carries both fields

#### Scenario: Discard
- **WHEN** the user changes a field and discards
- **THEN** the stored values are shown and Save and Discard are disabled again

#### Scenario: Compact controls
- **WHEN** the view renders on any width
- **THEN** Save and Discard are small buttons in the header row, not a sticky bottom bar

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

#### Scenario: Partial or network failure
- **WHEN** a save fails with a 400, 409 or network error
- **THEN** the draft is kept, the stored transaction is unchanged on the server, and Save can be retried

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

### Requirement: View is organized in Details, Sharing and Related tabs

The view SHALL render tabs Details, Sharing and Related through the shared Form View. Switching tabs SHALL NOT discard or prompt on the draft. The Related tab SHALL list only real relationships (settlement transactions linked via `TransactionRelation`, and the originating imported provider record) as read-only lists, and SHALL be hidden when there are none. Extending the Sharing tab for existing transactions belongs to the `transaction-sharing-conversion` capability.

#### Scenario: Tab switch keeps the draft
- **WHEN** the user edits the description, opens Sharing, then returns to Details
- **THEN** the edit is still present and unsaved

#### Scenario: Related lists
- **WHEN** a transaction has two settlement transactions and an imported source record
- **THEN** the Related tab lists them read-only

#### Scenario: Related hidden when empty
- **WHEN** a transaction has no related records
- **THEN** no Related tab is shown

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
- **WHEN** the user discards or navigates away from a prefilled draft
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

The Sharing tab of `/transactions/new` SHALL offer a shared toggle, a title and a participants list (`RelatedList` in draft mode) with editable shares, remove, an equal-split helper and a footer showing allocated, owner share and unallocated amounts. Saving a shared draft SHALL send the nested `sharedExpense` in a single `POST /transactions`. No new endpoint SHALL be introduced.

#### Scenario: Create a shared transaction
- **WHEN** a user enables sharing on a new draft, adds a participant and saves
- **THEN** one `POST /transactions` carries the `sharedExpense` payload and the transaction is created shared

#### Scenario: Edit participant shares directly
- **WHEN** the user changes a participant's share cell on a new draft
- **THEN** the footer totals update immediately and nothing is sent until Save

#### Scenario: Create failure keeps the draft
- **WHEN** the create request fails
- **THEN** no transaction or shared expense exists, the draft is kept and Save can be retried

### Requirement: Update accepts an optional sharedExpense

`updateTransactionSchema` SHALL accept an optional `sharedExpense`: `{ enabled: false }` or `{ enabled: true, title?, participants: [{ id?, userId? | manualName?, share }] }`. `PUT /transactions/:id` SHALL remain a single request whose effects are all-or-nothing. Existing-transaction behavior for this field is defined by `transaction-sharing-conversion`.

#### Scenario: Schema accepts the field
- **WHEN** a body with a valid `sharedExpense` is validated
- **THEN** it passes, and an invalid shape (negative share, missing participants when enabled) fails

### Requirement: View works at mobile width

The transaction view and new-draft view SHALL be fully usable at mobile width, with stacked field rows, stacked participant rows, and the header Save/Discard actions reachable without horizontal scrolling.

#### Scenario: Mobile edit and save
- **WHEN** a user edits and saves a transaction at 375px width
- **THEN** every field is operable and Save is reachable

### Requirement: Amount cannot drop below existing shares

`updateTransaction` SHALL reject an amount lower than the sum of the transaction's existing participant shares with a 400 naming the `amount` field, on the web API, `/v1`, and MCP. The view SHALL show it on the amount field.

#### Scenario: Amount below shares
- **WHEN** a transaction shared with participant shares totalling 60 is updated to amount 50
- **THEN** the request is rejected with a 400 on `amount`, the stored amount and shares are unchanged, and the view shows the error on the amount field with the draft kept

#### Scenario: Amount at or above shares
- **WHEN** the same transaction is updated to amount 60
- **THEN** the update succeeds
