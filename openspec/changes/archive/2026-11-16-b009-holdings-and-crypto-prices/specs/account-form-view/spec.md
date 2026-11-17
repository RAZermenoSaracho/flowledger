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

**Header and totals:**
- For `investment` and `crypto` accounts the Form View header SHALL show the name, the type and "Total value", taken from `holdingsValuation`.
- When the status is `partial` it SHALL add a subtle "Partial - N holdings without a value" indication, and when `empty` a "No holdings yet" indication. There SHALL be no second total.
- The UI SHALL NOT show a "Net deposited" figure or the ledger balance for these account types, and SHALL NOT show a reminder to update a cash holding.
- The accounts list and any totals widget SHALL use `holdingsValuation.value` only for these account types. Other account types SHALL look exactly as before.

**Holdings table (shared RelatedList):**
- Columns: Asset (code or name, with a type badge only in `investment` accounts and none in `crypto` accounts), Quantity (with its unit), Unit price (with its last-updated time as defined by `valuation-timestamps`), Source, Value in the account currency or "Value missing" with its reason, and a remove action.
- The table SHALL be compact. At mobile width rows SHALL stack, and a subtle secondary "Last updated" label MAY replace the tooltip.
- There SHALL be no stale badges, warning colors or age-based states.
- Cash rows SHALL be visibly distinct and show "Cash - at par" instead of a price source.

**Add holding:**
- In a `crypto` account there SHALL be no asset-type selector, and the kind is `crypto`.
- In an `investment` account there SHALL be an asset-type selector with Crypto, Cash, Stock, ETF and Other.
- The instrument field depends on the type: a code for crypto, stock and ETF (for example BTC, USDT, AAPL, VOO); a currency chosen with the existing currency picker for cash; a name and an optional unit for Other.
- The price source selector depends on the type: for crypto, "Binance (automatic)" or "Manual"; for stock, ETF and Other, Manual only, shown as fixed text without a selector; for cash, none.
- With the automatic source the row SHALL show the quoted unit price and "Binance", with no editable price controls.
- A manual price SHALL be one compact integrated monetary input, for example `[ 1,000.00   USD v ]`: the amount is the primary field, and the currency is inline text with a subtle chevron inside the same box.
  - Activating the currency by click or keyboard SHALL open the existing currency picker.
  - The default currency of a new manual price SHALL be the account currency.
  - It SHALL be labeled, show a visible focus state, be keyboard operable and stay usable at mobile width.

**Editing:**
- Adding, editing and removing holdings SHALL happen inline in the account Form View draft, saved and discarded by the existing Save and Discard, with unsaved-change protection. No separate form, modal or route SHALL be used.
- Precision errors SHALL be shown inline, using the existing amount-precision messages.

**Incompatible stored holdings:** a non-crypto holding stored in a `crypto` account SHALL be shown with a subtle note and only a remove action.

All values SHALL come from the API, and the web app SHALL NOT compute valuations.

#### Scenario: Tab visibility
- **WHEN** a `checking` or `credit_card` account is opened
- **THEN** no Holdings tab is shown

#### Scenario: Header total
- **WHEN** an `investment` account with a ledger balance of 1000 and holdings valued at 850 is opened
- **THEN** the header shows "Total value" 850, and neither 1000 nor "Net deposited" appears

#### Scenario: Empty and partial indications
- **WHEN** an account has no holdings, or one of its holdings has no value
- **THEN** the header shows "No holdings yet", or the known total with a subtle "Partial" indication, and never a second total

#### Scenario: Add to a crypto account
- **WHEN** the user adds a holding in a `crypto` account
- **THEN** no asset-type selector is shown, and the holding is saved with kind `crypto`

#### Scenario: Add to an investment account
- **WHEN** the user adds a holding in an `investment` account and picks Stock
- **THEN** a code field is shown, the price source is fixed as Manual, and a manual price is required

#### Scenario: Integrated price input
- **WHEN** the user opens the currency part of a manual price input by keyboard
- **THEN** the existing currency picker opens, and a new price defaults to the account currency

#### Scenario: Save and discard
- **WHEN** the user adds 0.5 BTC and presses Save, or edits a quantity and presses Discard
- **THEN** Save sends one holdings change set and shows the API valuations, and Discard shows the original quantity and sends nothing

#### Scenario: Missing value displayed
- **WHEN** a holding has no available value
- **THEN** its value cell reads "Value missing" with no last-updated time, and the header shows the known total with the partial indication

#### Scenario: Incompatible holding
- **WHEN** a `crypto` account stores a cash holding
- **THEN** the row shows a subtle note and only a remove action

#### Scenario: Timestamp on touch
- **WHEN** the user taps a market price on a phone
- **THEN** "Last updated:" followed by the formatted date and time is shown

#### Scenario: Mobile
- **WHEN** the Holdings tab is opened at mobile width
- **THEN** holdings render as stacked records with every field readable

### Requirement: Manual price read-only at rest

In the Holdings tab a manual unit price SHALL render as formatted text (for example `1.00 USD`), like automatic prices, and SHALL be an activatable control named like "Edit unit price of BTC".

- Activating it (click, Enter, Space or tap) SHALL show the compact money input, amount with the inline currency on one line, for that row only.
- Blur outside the price cell, Escape or Enter SHALL return it to text showing the draft value.
- A new row that needs a price SHALL start in edit mode.
- Draft, Save, Discard and unsaved-change protection SHALL be unchanged.
- Automatic prices SHALL stay read-only text with their source. No input box SHALL be shown at rest.

#### Scenario: Price at rest
- **WHEN** a holding has a manual price of 1 USD
- **THEN** the row shows "1.00 USD" as text and no input

#### Scenario: Inline edit
- **WHEN** the user activates the price by click or keyboard
- **THEN** one amount-plus-currency input appears on one line in that row

#### Scenario: Leaving edit mode
- **WHEN** the user presses Escape, Enter or clicks outside the price cell
- **THEN** the input is replaced by text showing the draft value, and the draft remains unsaved until Save

#### Scenario: Automatic price
- **WHEN** a holding is market-priced
- **THEN** its price is read-only text with its source and is not activatable

### Requirement: Initial balance hidden for holding accounts

Account creation and the General tab SHALL NOT show the Initial balance field when the type is `investment` or `crypto`, including when the type is switched to one of them in the form. Every other type SHALL keep the field. Creating a holding-type account SHALL NOT send a non-zero initial balance. The stored field is not deleted.

#### Scenario: Create investment account
- **WHEN** the user chooses type Investment or Crypto in the create form
- **THEN** no Initial balance field is shown

#### Scenario: Type switch
- **WHEN** the user switches the type between a holding type and another type
- **THEN** the field is hidden for the holding type and shown again with its stored value for the other type

#### Scenario: Other types
- **WHEN** the type is checking, savings, cash or credit card
- **THEN** the Initial balance field is shown as before

### Requirement: Net contributions line

The Transactions tab of an `investment` or `crypto` account SHALL show a subtle line `Net contributions: <amount>` in the account currency, using `contributions.net`, above or below the list.

The Transactions list of an `investment` or `crypto` account SHALL always include transfers into the account as well as its own rows, so every transfer counted in Net contributions is visible. Other account types keep their existing list scope (transfers in are added only with a billing-period filter).

- Secondary text or a tooltip SHALL read "Transfers in <incoming> · out <outgoing>".
- When `excludedCount > 0` it SHALL also say "N transfers without a recorded amount are not included".
- The line SHALL NOT appear in the header and SHALL NOT be labelled Balance, Available cash, Profit or Return.
- Other account types SHALL NOT show it. Transfers in the list display as before.

#### Scenario: Line shown
- **WHEN** an investment account has contributions with net 800, incoming 1000 and outgoing 200
- **THEN** the Transactions tab shows "Net contributions: 800.00" with "Transfers in 1,000.00 · out 200.00"

#### Scenario: Incoming transfers are listed
- **WHEN** an investment account's only transaction is a transfer into it from checking
- **THEN** its Transactions list shows that transfer, and a checking account's list without a billing-period filter still shows only its own rows

#### Scenario: Excluded transfers
- **WHEN** `excludedCount` is 2
- **THEN** the line adds "2 transfers without a recorded amount are not included"

#### Scenario: Other account types
- **WHEN** the account is a checking account
- **THEN** no net contributions line is shown
