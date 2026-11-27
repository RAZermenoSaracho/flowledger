## ADDED Requirements

### Requirement: Billing period date editing

In the Credit card tab's Billing periods table, each period SHALL allow editing Period end and Payment due inline with Save and Cancel. A manually adjusted date SHALL be marked "Adjusted" with the default date shown, and SHALL offer reset to default. Validation errors from the API SHALL be shown on the row without losing the entered values. The same controls SHALL work in the stacked mobile layout.

#### Scenario: Edit and save
- **WHEN** the owner edits Period end of a row and saves
- **THEN** the table reloads with the new end, the following row's start moves, and the row shows "Adjusted" with the default date

#### Scenario: Cancel
- **WHEN** the owner cancels an edit
- **THEN** no request is sent and the row shows its previous dates

#### Scenario: Rejected value
- **WHEN** the API rejects a date
- **THEN** the message appears on the row and the inputs keep the entered values

#### Scenario: Reset
- **WHEN** the owner resets an adjusted date
- **THEN** the date returns to the default and its "Adjusted" marker disappears
