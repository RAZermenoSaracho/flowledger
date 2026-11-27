## ADDED Requirements

### Requirement: Billing period date editing

In the Credit card tab's Billing periods table, the Period end and Payment due cells SHALL be edited in place: the date is a keyboard-focusable button that turns the same cell into a native date input. Enter, or choosing a date and blurring, saves; Escape cancels and restores the value; an unchanged or empty value sends nothing. The table has no separate "Adjust dates" column, Edit button or expanding form, and its columns stay Period start, Period end, Payment due, Debt at closing, Payments & credits, Remaining to avoid interest, Status. Period start is not editable: it is always the previous period's end plus one day, as returned by the API. While saving, the cell SHALL show "Saving…" until the refreshed value arrives. An API rejection SHALL appear under that cell (announced politely), keep the input and the typed value, and allow correction. A manually adjusted date SHALL show a compact "Adjusted" badge, the default date and a reset-to-default icon button with an accessible name. Focus SHALL return to the date button after a save, cancel or reset. The same controls SHALL work in the stacked mobile layout.

#### Scenario: Edit and save
- **WHEN** the owner activates the Period end date, types a new date and presses Enter
- **THEN** the cell shows "Saving…", the table reloads with the new end, the following row's start moves, and the cell shows "Adjusted" with the default date

#### Scenario: Cancel
- **WHEN** the owner presses Escape while editing
- **THEN** no request is sent, the previous date is shown and focus is on the date button

#### Scenario: Rejected value
- **WHEN** the API rejects a date
- **THEN** the message appears under the cell and the input keeps the typed value

#### Scenario: Reset
- **WHEN** the owner activates the reset button of an adjusted date
- **THEN** the date returns to the default and its "Adjusted" marker disappears
