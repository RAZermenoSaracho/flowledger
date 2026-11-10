# Spec Delta

## ADDED Requirements

### Requirement: Convert an existing transaction to shared

From the Transaction Form View of an existing, not-yet-shared transaction, a user SHALL be able to enable sharing, choose a title and participants, and save. Saving SHALL update the transaction and then create its shared expense, using the same Save as every other field. This SHALL work at mobile and desktop widths.

#### Scenario: Convert on mobile
- **WHEN** a user at 375px width opens an unshared expense, enables sharing, adds a participant and saves
- **THEN** the transaction becomes shared with that participant

#### Scenario: Convert on desktop
- **WHEN** a user at desktop width does the same
- **THEN** the transaction becomes shared with that participant

#### Scenario: Convert with other edits
- **WHEN** the user changes the description and enables sharing in one session and saves
- **THEN** both changes are stored

### Requirement: Shared transactions appear in list, balances and debts

After conversion the transaction SHALL appear as shared in the transactions list, and its participants' shares SHALL appear in the relevant balances and debts. Participants SHALL receive the usual shared-expense and debt notifications.

#### Scenario: List shows shared
- **WHEN** a transaction has just been converted
- **THEN** the transactions list shows it as shared

#### Scenario: Debts reflect shares
- **WHEN** a transaction of 100 is converted with a participant share of 40
- **THEN** the debts view shows 40 owed to the user by that participant

#### Scenario: Participants notified
- **WHEN** conversion succeeds
- **THEN** each participant receives the same notifications as for a shared expense created with the transaction

### Requirement: Sharing limits hold during conversion

A transfer SHALL NOT be shareable, and participant shares SHALL NOT exceed the transaction amount. Violations SHALL block Save with an error on the offending field, and the server SHALL reject them as well.

#### Scenario: Transfer cannot be shared
- **WHEN** the user selects type transfer
- **THEN** the sharing controls are cleared and unavailable
- **AND** a direct request to share a transfer is rejected by the server

#### Scenario: Shares exceed amount
- **WHEN** participant shares total more than the amount
- **THEN** Save is blocked with an error

### Requirement: Failed sharing step can be retried alone

If the transaction update succeeds and creating the shared expense fails, the view SHALL refetch the transaction, keep the sharing fields in the draft, and show the error. Retrying Save SHALL repeat only the sharing step and SHALL NOT create a duplicate.

#### Scenario: Sharing step fails
- **WHEN** the update succeeds and the shared-expense request fails
- **THEN** the saved transaction fields are shown as stored, the sharing fields stay in the draft, and an error is shown

#### Scenario: Retry
- **WHEN** the user saves again
- **THEN** only the shared-expense request is sent, and on success the transaction is shared once

### Requirement: Already-shared transactions show participants read-only

For a transaction that already has a shared expense, the view SHALL show its participants without editable controls and SHALL NOT issue a sharing step on save.

#### Scenario: Open a shared transaction
- **WHEN** a user opens a transaction that is already shared
- **THEN** participants are displayed read-only
- **AND** saving another field sends no shared-expense request

### Requirement: Duplicate conversion is a conflict

Creating a shared expense for a transaction that already has one SHALL fail with a 409 and a clear message, not an internal error, and SHALL leave existing sharing unchanged. Access to another user's transaction SHALL remain not-found.

#### Scenario: Second conversion
- **WHEN** a client posts a shared expense for an already-shared transaction
- **THEN** the response is 409 "This transaction is already shared" and existing participants are unchanged

#### Scenario: Another user's transaction
- **WHEN** a user posts a shared expense for a transaction owned by someone else
- **THEN** the response is not-found and nothing is created
