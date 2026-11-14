# Spec Delta

## MODIFIED Requirements

### Requirement: Account view tabs and related transactions

The account view SHALL pass `tabs` to the shared Form View:
- "General": all editable fields, type sections and the sync panel.
- "Transactions".
- For `credit_card` accounts only, a third tab, "Credit card".

**Transactions tab:**
- It SHALL list the account's transactions newest first (date descending, then id descending).
- They SHALL be loaded server-side 20 rows at a time through the existing `GET /transactions` endpoint filtered by `accountId`.
- It SHALL use the shared related-transactions list, which the Group view also uses. That list provides:
  - the shared search bar with name search and the transaction sort options;
  - the shared pagination control showing the editable record range with Previous/Next;
  - loading, empty and error states.
- Each row SHALL link to the transaction and show date, category and amount.
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
- Selecting a period SHALL open the account's existing Transactions list filtered to that period's dates. There SHALL be no statement editing.
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
- **THEN** the card's transactions dated in that period are listed, through the existing transactions list

#### Scenario: Estimate is distinct
- **WHEN** a period has an estimate and a confirmed interest charge
- **THEN** both are shown, the estimate is labeled "Estimated", and only the confirmed charge exists as a transaction

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
