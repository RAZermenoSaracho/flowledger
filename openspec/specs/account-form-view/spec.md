# account-form-view Specification

## Purpose
Linkable, directly editable account view on the shared Form View, with General and Transactions tabs and server-paginated related transactions.

## Requirements

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

### Requirement: Account view tabs and related transactions

The account view SHALL pass `tabs` to the shared Form View:
- "General": all editable fields, type sections and the sync panel.
- "Transactions".
- For `credit_card` accounts only, a third tab, "Credit card".

**Transactions tab:**
- It SHALL list the account's transactions newest first (date descending, then id descending).
- They SHALL be loaded server-side 20 rows at a time through the existing `GET /transactions` endpoint filtered by `accountId`.
- It SHALL use the shared related-transactions list, which the Group view also uses. That list provides:
  - the standard transactions search bar, with the same fields, operators, AND/OR groups, chips, grouping and sorting as the Transactions page;
  - the shared pagination control showing the editable record range with Previous/Next;
  - loading, empty and error states.
- Each row SHALL link to the transaction and show date, category and amount.
- The account (or group) scope SHALL be applied outside the user's filters and AND-ed with them, so filters can only narrow it.
- No new endpoint is introduced for this tab, and ownership remains enforced by the server.

**Credit card tab:**
- It SHALL show these figures: outstanding debt, credit limit, available credit, utilization, next closing date, next payment due date, the current amount to pay to avoid interest with its status, and the interest estimate, labeled "Estimated", next to the confirmed interest.
- Over-limit cards SHALL be highlighted, and so SHALL overdue or outstanding amounts.
- It SHALL show a billing-periods table on the shared list components, paginated 12 periods at a time. The columns are:
  - period start;
  - period end;
  - payment due;
  - debt at closing;
  - credits ("Payments & credits"), with an informational breakdown into transfers, external payments, refunds, cashback and other credits;
  - remaining to avoid interest;
  - status.
- The table SHALL be readable at mobile width as stacked records.
- Selecting a period SHALL open the account's Transactions tab with a removable "Billing period" condition in its search bar, not a separate filter control:
  - the condition uses the period's exact start and end instants from the API (half-open, in the card's billing time zone), and its chip shows the dates in that zone;
  - it combines with any other condition, appears read-only in the filter editor and is not offered in the field picker;
  - while it is present, transfers into the card are included, matching how billing counts them;
  - it is carried in the URL (`periodStartAt`, `periodEndAt`), so refresh, back/forward and the period link restore it; removing the chip clears it from the URL and keeps the other filters.
- There SHALL be no statement editing.
- It SHALL offer these actions:
  - "Pay": a prefilled transfer draft into this card for the current remaining amount;
  - "Record external payment": a prefilled income draft on this card classified `payment`;
  - "Record interest charge": a prefilled expense draft on this card classified `interest`.
- For an unconfigured card, it SHALL prompt the user to set the billing configuration on General.

All figures in the Credit card tab SHALL come from the API. The web app SHALL NOT compute balances or allocation.

#### Scenario: Tabs shown
- **WHEN** an account view is opened
- **THEN** the General and Transactions tabs are shown, plus Credit card for a `credit_card` account, and General is active

#### Scenario: Paging
- **WHEN** the user opens Transactions and presses Next
- **THEN** rows 21 to 40 are requested with the same `accountId` filter and shown, and Previous returns to rows 1 to 20

#### Scenario: Empty and error
- **WHEN** the account has no transactions, or the request fails
- **THEN** an empty message, or an error message, is shown instead of rows

#### Scenario: Pay from the card
- **WHEN** the user presses Pay with 4000 remaining
- **THEN** `/transactions/new` opens as a transfer into this card for 4000, nothing is created until Save, and the back arrow returns to the Credit card tab

#### Scenario: Billing periods table
- **WHEN** a configured card with six closed periods is opened on the Credit card tab
- **THEN** the open period and the six closed periods are listed newest first, with every column filled from the API

#### Scenario: Period drill-down
- **WHEN** the user selects the period from 2027-01-21 to 2027-02-20
- **THEN** the Transactions tab opens with a "Billing period" chip, listing the card's transactions and the transfers into it within that period's exact boundaries

#### Scenario: Removing the period condition
- **WHEN** the user has a Billing period and a name condition and removes the Billing period chip
- **THEN** the name condition stays, the period leaves the URL, and the list returns to the account's own transactions

#### Scenario: Estimate is distinct
- **WHEN** a period has an estimate and a confirmed interest charge
- **THEN** both are shown, the estimate is labeled "Estimated", and only the confirmed charge exists as a transaction

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

The account view SHALL NOT force every account type to show identical fields. It SHALL show type-specific fields or sections only where a real difference exists.

`credit_card` accounts SHALL show a section on the General tab with:
- the credit limit;
- the statement closing day;
- the due-date rule and value;
- the billing time zone, defaulting to the device zone when first set;
- the annual interest rate.

These fields SHALL use the same draft and Save as the common fields. Every other type SHALL show only the common fields. An account type SHALL be able to add its own section within the account domain without changing the shared Form View foundation.

#### Scenario: Types with no differences
- **WHEN** a non-card account is opened
- **THEN** it shows the common fields and no type-specific section

#### Scenario: Card section
- **WHEN** a `credit_card` account is opened
- **THEN** the card configuration fields appear on General and save with the common fields in one request

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

### Requirement: Manual account creation view

The accounts page SHALL offer an "Add account" chooser with "Manual account" and "Sync accounts". "Manual account" SHALL open `/accounts/new`, an unsaved draft on the shared Form View with the General fields and type sections only, which creates nothing until Save and then opens the new account. "Sync accounts" SHALL keep the provider flow and SHALL be disabled while bank sync is unavailable.

#### Scenario: Manual creation
- **WHEN** the user chooses "Manual account", fills the fields and presses Save
- **THEN** one account is created and its view opens at `/accounts/<id>`

#### Scenario: Discarded draft
- **WHEN** the user leaves `/accounts/new` without saving
- **THEN** no account is created
