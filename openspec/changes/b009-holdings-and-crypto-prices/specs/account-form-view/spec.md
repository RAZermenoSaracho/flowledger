# Spec Delta

## MODIFIED Requirements

### Requirement: Account view tabs and related transactions

The account view SHALL pass `tabs` to the shared Form View:
- "General": all editable fields, type sections and the sync panel.
- "Transactions".
- For `credit_card` accounts only, a third tab, "Credit card".
- For `investment` and `crypto` accounts only, a "Holdings" tab, defined in "Holdings tab".

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
- **THEN** the General and Transactions tabs are shown, plus Credit card for a `credit_card` account and Holdings for an `investment` or `crypto` account, and General is active

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

## ADDED Requirements

### Requirement: Holdings tab

**Holdings list:**
- The Holdings tab SHALL list the account's holdings on the shared RelatedList.
- Fiat cash rows SHALL be visibly distinct from instrument rows.
- Each holding SHALL show:
  - instrument code and kind;
  - quantity, with every stored digit;
  - unit price in its original currency;
  - value in the account currency;
  - source ("Cash", "Manual" or "Market (Binance, USDT = USD)").
- Each price SHALL carry its last-updated time as defined by `valuation-timestamps`: a tooltip that opens on hover, focus and tap, or a small secondary label in stacked mobile rows.
- A missing value SHALL read "Value missing" with its reason, and SHALL never be displayed as 0.
- There SHALL be no stale badges, warning colors, or age-based states.

**Editing:**
- Adding, editing (quantity, manual price, price currency, valuation date) and removing holdings SHALL happen inline in the account Form View draft.
- The account Form View's Save and Discard SHALL save or discard these changes. No separate form, modal or route SHALL be used.
- A manual price SHALL be clearable, which switches the holding back to the market quotation.
- Precision errors SHALL be shown inline, using the existing amount-precision messages.

**Aggregate value:**
- The account header SHALL show the aggregate value, labeled partial when it is, next to "Net deposited" (the transaction-derived balance).
- The accounts list SHALL show the aggregate value for accounts with holdings, labeled as holdings value.
- An account with no holdings SHALL look exactly as before.
- When an account has holdings, the tab SHALL explain that deposits and withdrawals change "Net deposited", and that the cash holding is updated by editing it.

All values SHALL come from the API, and the web app SHALL NOT compute valuations.

#### Scenario: Tab visibility
- **WHEN** a `checking` or `credit_card` account is opened
- **THEN** no Holdings tab is shown

#### Scenario: Add and save
- **WHEN** the user adds 0.5 BTC and 200 USD on the Holdings tab and presses Save
- **THEN** one holdings change set is sent, the rows show their API valuations, and the draft is clean

#### Scenario: Discard
- **WHEN** the user edits a quantity and presses Discard
- **THEN** the original quantity is shown and nothing is sent

#### Scenario: Missing value displayed
- **WHEN** a holding has no available value
- **THEN** its value cell reads "Value missing" with no last-updated time, and the header shows the known subtotal labeled partial

#### Scenario: Timestamp on touch
- **WHEN** the user taps a market price on a phone
- **THEN** "Last updated:" followed by the formatted date and time is shown

#### Scenario: Mobile
- **WHEN** the Holdings tab is opened at mobile width
- **THEN** holdings render as stacked records with every field readable
