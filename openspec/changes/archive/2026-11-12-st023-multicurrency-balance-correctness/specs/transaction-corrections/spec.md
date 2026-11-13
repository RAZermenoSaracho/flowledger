## Purpose

Defines the append-only history that records who changed a transaction's financial values, when, and from what to what, including a final record that outlives deletion. It applies to changes made after this capability ships; no history is reconstructed for earlier records.

## ADDED Requirements

### Requirement: Correction recorded with each financial edit

When an update changes any financial field, the system SHALL append one correction row in the same database transaction as the update. The financial fields are:
- `type`, `amount`, `executionCurrency`, `accountId`, `transferToAccountId`, `accountAmount`, `destinationAmount`, `feeAmount`, `feeCurrency` and `date`

The row SHALL hold:
- the transaction id
- the acting user
- the time
- the previous and corrected values of all financial fields, with decimals as exact strings

If the update fails, no row SHALL be written. If the row cannot be written, the update SHALL fail. An update that changes no financial field SHALL write no row. This SHALL hold on the web API, `/v1` and MCP.

#### Scenario: Amount corrected

- **WHEN** the owner changes a transfer's `destinationAmount` from 1700 to 1690
- **THEN** one correction row records the previous 1700, the corrected 1690, the owner as actor and the time, and the destination balance reflects 1690

#### Scenario: Non-financial edit

- **WHEN** the owner changes only the description
- **THEN** no correction row is written

### Requirement: Final correction survives deletion

Deleting a transaction SHALL append, in the same database transaction, a final correction row that holds the deleted financial values and marks the deletion. The row SHALL remain after the transaction is gone.

#### Scenario: Delete

- **WHEN** the owner deletes a transaction
- **THEN** a deletion row with its last financial values exists afterwards, and the transaction does not

### Requirement: Corrections are append-only and owner-scoped

Correction rows SHALL never be updated or deleted by any application path, except when their owning user is deleted. Correction rows SHALL be readable only by their owner, scoped by the owner's id.

#### Scenario: Another user

- **WHEN** a user requests corrections for another user's transaction id
- **THEN** none are returned
