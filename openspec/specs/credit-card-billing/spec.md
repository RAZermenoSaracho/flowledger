# credit-card-billing Specification

## Purpose
Defines credit-card billing as a read-time projection of the card configuration and the existing transaction ledger: billing periods, closing debt, payment windows, allocation, remaining obligation, status, carry-forward, and estimated versus confirmed interest. Nothing derived is persisted.

## Requirements

### Requirement: Billing period boundaries

For a card with cycle configuration, all boundaries SHALL be computed in the card's `billingTimeZone` as half-open intervals of instants.

- **Closing date:** `statementClosingDay` of each month, or the month's last day when the month is shorter.
- **Closing boundary `close(N)`:** the start of the day after period N's closing date.
- **Period N** = [`close(N−1)`, `close(N)`). A transaction SHALL belong to the one period that contains its `date`.
- **Due date:**
  - `day_of_next_month`: day `paymentDueValue` of the month after the closing date, clamped to that month's last day.
  - `days_after_closing`: the closing date plus `paymentDueValue` days.
- **Due boundary `due(N)`:** the start of the day after the due date. It never exceeds `close(N+1)`.
- **Payment window of period N** = [`close(N)`, `close(N+1)`). The on-time part is [`close(N)`, `due(N)`).

Every instant after the first closing belongs to exactly one payment window.

#### Scenario: Closing on the 20th, due on the 20th of the next month
- **WHEN** a card has closing day 20, rule `day_of_next_month` and value 20
- **THEN** these periods result:

  | Period | Due | Payment window |
  |---|---|---|
  | 2026-10-21 to 2026-11-20 | 2026-12-20 | from 2026-11-21 through 2026-12-20 |
  | 2026-11-21 to 2026-12-20 | 2027-01-20 | from 2026-12-21 through 2027-01-20 |

#### Scenario: Short months and leap years
- **WHEN** a card has closing day 31
- **THEN** periods close on 2027-01-31, 2027-02-28, 2027-03-31 and 2028-02-29, and the period after 2027-01-31 runs 2027-02-01 to 2027-02-28

#### Scenario: Days after closing across a year boundary
- **WHEN** a card has rule `days_after_closing` with value 20 and a period closes 2026-12-20
- **THEN** that period is due 2027-01-09

#### Scenario: Midnight boundary
- **WHEN** the zone is `America/Mexico_City` and the closing day is 20
- **THEN** a purchase at 2027-01-20 23:59 local time (2027-01-21T05:59Z) belongs to the period closing 2027-01-20, and a purchase at 2027-01-21 00:00 local time (06:00Z) belongs to the next period

#### Scenario: Daylight-saving transition
- **WHEN** the zone is `America/New_York`, the closing day is 14, and DST starts on 2027-03-14
- **THEN** the period closing 2027-03-14 runs from 2027-02-15T05:00Z (00:00 EST) to 2027-03-15T04:00Z (00:00 EDT), exclusive

#### Scenario: Due date includes the whole day
- **WHEN** a period is due 2026-12-20 in `America/Mexico_City`
- **THEN** a payment at 2026-12-20 23:59 local time is on time, and the period is overdue from 2026-12-21 00:00 local time

#### Scenario: Bare-date transaction
- **WHEN** a transaction is created with the bare date `2027-01-21`, which is stored as `2027-01-21T00:00Z`, that is, 2027-01-20 18:00 in Mexico City
- **THEN** it belongs to the period closing 2027-01-20, consistent with how the app displays it

### Requirement: Closing debt is derived from the whole ledger

A period's closing debt SHALL be max(0, −balance), where balance is computed with the existing balance calculation over every card transaction dated before `close(N)`. It therefore includes:
- previous unpaid debt;
- purchases, transfers out, interest and fees;
- refunds, credits and payments made before closing.

It SHALL NOT be the sum of the period's expenses. A non-negative balance at closing SHALL give closing debt 0, and the period needs no payment.

#### Scenario: Payments and credits before closing count once
- **WHEN** the card owes 0 on 2026-09-21 and, in the period ending 2026-10-20, records:
  - a 5000 purchase;
  - a 500 refund;
  - a 1000 transfer payment
- **THEN** closing debt is 3500, and neither the refund nor the payment reduces that period's remaining amount again

#### Scenario: Newer purchases are not retroactive
- **WHEN** a 2000 purchase is dated 2026-10-25, after the 2026-10-20 closing
- **THEN** the October closing debt stays 3500 and the 2000 belongs to the next period

#### Scenario: Credit balance at closing
- **WHEN** the card balance is +200 at the closing boundary
- **THEN** closing debt is 0 and the period's status is paid

### Requirement: Payments, credits and remaining obligation

For each closed period N, the system SHALL derive these figures from transactions dated within its payment window:
- **credits** = the `destinationAmount` of transfers into the card, plus the `accountAmount` of all card income, whatever its classification;
- **remaining to avoid interest** = max(0, closing debt − credits);
- **on-time remaining** = the same figure, using only the on-time part of the window.

A transaction SHALL count toward at most one period. Purchases and transfers out within the window SHALL NOT increase that period's remaining amount.

Every credit SHALL reduce the obligation equally. Credits SHALL also be broken down, for information only, into transfers, external payments, refunds, cashback and other credits. A credit dated in the window counts toward that period even when it refunds a purchase made after closing.

#### Scenario: Partial payment
- **WHEN** the conditions are:
  - limit 30000;
  - closing debt 10000;
  - 2000 of purchases after closing, so current debt is 12000;
  - a debit account holding 20000 transfers 6000 to the card inside the window
- **THEN** the debit account holds 14000, debt is 6000, and available credit is 24000; the period shows credits 6000 (transfers 6000), remaining 4000 and `partially_paid`; and no expense or income is added

#### Scenario: Full payment with newer purchases
- **WHEN** 10000 is transferred inside the window instead
- **THEN** the period is `paid` with remaining 0, and debt is the 2000 of newer purchases

#### Scenario: External payment
- **WHEN** a 6000 card income classified `payment` is recorded inside the window
- **THEN** the period shows credits 6000 (external payments 6000) and remaining 4000, exactly as the transfer did

#### Scenario: Refund after closing
- **WHEN** a 1000 refund and a 50 cashback are recorded inside the window of a 10000 period
- **THEN** the period shows credits 1050 (refunds 1000, cashback 50) and remaining 8950

#### Scenario: Overpayment
- **WHEN** 15000 is transferred to a card owing 12000 with closing debt 10000
- **THEN** the period is `paid`, debt is 0, and the credit balance is 3000

#### Scenario: Cross-currency payment
- **WHEN** a USD account transfers 300 USD to an MXN card with `destinationAmount` 5400
- **THEN** credits rise by 5400 MXN, using the persisted amount without any rate lookup

### Requirement: Status and carry-forward

The status of each period SHALL be derived:
- `open`: the current period, not yet closed;
- `paid`: closing debt is 0, or on-time remaining is 0;
- `paid_late`: remaining is 0 but on-time remaining was greater than 0;
- `pending`: before the due boundary, with remaining greater than 0 and no payment or credit yet;
- `partially_paid`: before the due boundary, with remaining greater than 0 after some payment or credit;
- `overdue`: on or after the due boundary, with remaining greater than 0. A later period with its own closing debt does not end this status.

Unpaid debt SHALL stay in the ledger and appear in later closing debts. The remaining amount of an older period SHALL be shown as history, carried into later periods, and SHALL never be asked for. No transaction SHALL be created to carry it forward. The current amount owed SHALL be the latest closed period's remaining figure, never a sum across periods.

#### Scenario: Multiple unpaid periods without double counting
- **WHEN** the following happens on one card:
  - period A closes 2027-01-20 with debt 10000;
  - 4000 is paid on 2027-02-01;
  - a 3000 purchase is made on 2027-02-05;
  - no other payment is made by 2027-02-20;
  - 9000 is paid on 2027-03-01
- **THEN** the periods show:
  - A: credits 4000, remaining 6000, `overdue`;
  - B (closing 2027-02-20): closing debt 9000, that is the 6000 carried plus the 3000 new; credits 9000, remaining 0, `paid`;
  - the 9000 payment counts only toward B, the current amount owed is never 6000 + 9000, and total credits of 13000 equal the 10000 plus 3000 charged

#### Scenario: Overdue
- **WHEN** a card has closing day 31 and rule `days_after_closing` 20, and its period closing 2027-01-31 (due 2027-02-20) has 6000 remaining at 2027-02-21 00:00 local time
- **THEN** the period is `overdue`, and a 6000 payment on 2027-02-25 makes it `paid_late`

### Requirement: Results follow the ledger

Billing figures SHALL be recalculated on every read from the current ledger. Editing, deleting, moving or backdating a transaction SHALL change every affected period, including closed ones. No billing figure, snapshot, payment total or allocation SHALL be stored. API, MCP, web and the reminder worker SHALL use one calculation and return identical figures for the same ledger and instant.

#### Scenario: Edited and deleted payment
- **WHEN** the 6000 payment of the partial-payment scenario is edited to 4000, and later deleted
- **THEN** remaining becomes 6000 and then 10000, and debt becomes 8000 and then 12000

#### Scenario: Backdated purchase
- **WHEN** an 800 purchase dated 2027-01-15 is recorded on 2027-03-05
- **THEN** period A's closing debt becomes 10800, and every later period is recalculated

#### Scenario: Transfer moved to another account
- **WHEN** a transfer payment's destination is changed from the card to a savings account
- **THEN** it no longer counts as a credit, and the card's debt and periods are recalculated

### Requirement: Interest estimate

When the card has an `annualInterestRate` and a closed period's on-time remaining is greater than 0, the system SHALL estimate that period's interest. If the due boundary is still in the future, the current remaining figure is used, as a projection. The estimate assumes the grace period is lost.

The estimate SHALL be rate / 100 / 365 × the sum of end-of-day debt for each billing-zone day of the payment window. Days after now use the current debt. The result is rounded to the card currency's precision.

The estimate SHALL be labeled as an estimate and list its assumptions:
- average daily balance;
- simple daily interest on a 365-day year;
- no tax;
- no installment, promotional or deferred-interest balances.

When on-time remaining is 0, no estimate SHALL be shown. When no rate is configured, the estimate SHALL be shown as unavailable.

The estimate SHALL never create a transaction or change debt, available credit, net worth or any report.

#### Scenario: Estimate after a partial payment
- **WHEN** the conditions are:
  - rate 60%;
  - period A closes 2027-01-20 with debt 10000;
  - 4000 is paid on 2027-02-01;
  - 3000 is spent on 2027-02-05;
  - the window runs from 2027-01-21 through 2027-02-20 (31 days)
- **THEN** end-of-day debts are 10000 for 11 days, 6000 for 4 days and 9000 for 16 days (sum 278000), the estimate is 456.99 (456.986… rounded to MXN precision; a JPY card rounds to 0 decimals), it is labeled as an estimate, and debt, available credit and net worth are unchanged

#### Scenario: Before the due date
- **WHEN** the same card is viewed on 2027-02-10
- **THEN** the projection, with current debt 9000 assumed through 2027-02-20, shows 456.99 "if 6000 is not paid by 2027-02-20"

#### Scenario: Paid in time
- **WHEN** the 6000 is paid before the due boundary
- **THEN** no estimate is shown for period A

### Requirement: Confirmed interest

A real interest charge SHALL be recorded as an ordinary expense on the card classified `interest`. It SHALL belong to the period that contains its date. Its effect on debt, available credit, spending and net worth SHALL be the same as any card expense.

Each period SHALL report its total confirmed interest separately from the estimate. Interest SHALL never be posted automatically.

#### Scenario: Confirm interest
- **WHEN** the owner records a 457 expense classified `interest` dated 2027-02-20
- **THEN** debt rises by 457, available credit falls by 457, monthly expenses include 457, net worth falls by 457, and period B shows confirmed interest 457

#### Scenario: Imported interest duplicate
- **WHEN** the card's import later brings a pending 457 charge
- **THEN** the pending row lists the recorded interest expense as a possible duplicate, and ignoring the row leaves a single 457 charge

### Requirement: Imported transactions affect nothing until booked

A pending or ignored imported row SHALL NOT affect any balance, card debt, billing figure, report or reminder. Only booking it through the existing import action SHALL create an ordinary transaction, which then follows the normal card semantics.

Booking a positive row on a `credit_card` account SHALL create card income and SHALL NOT require a category. A category is meaningless for a liability credit, and the row MAY carry `creditCardKind`. No Syncfy-specific payment hook SHALL exist. Existing import duplicate prevention is unchanged.

#### Scenario: Pending import
- **WHEN** a pending 6000 credit is imported for the card
- **THEN** card debt, the period's remaining amount and every report are unchanged

#### Scenario: Booked import
- **WHEN** the owner books that row
- **THEN** one card income of 6000 exists, debt falls by 6000, and the period's credits rise by 6000

### Requirement: Possible duplicates in import review

Each pending imported row in the imported-transactions list SHALL include up to three possible duplicates. A possible duplicate is an existing transaction of the same owner that meets all of these conditions:
- it involves the row's account as source or destination;
- its applied amount for that account equals the row's absolute amount;
- it is dated within five days of the row;
- it is not already linked to an import.

Possible duplicates SHALL be informational only. The owner resolves them with the existing ignore action.

#### Scenario: Manual payment then import
- **WHEN** a 6000 payment income on the card exists and the card's import brings a pending 6000 credit two days later
- **THEN** the pending row lists that transaction as a possible duplicate, and ignoring the row leaves debt reduced by 6000 once

### Requirement: Card billing endpoint

`GET /accounts/:id/credit-card` SHALL require authentication and ownership, and return:
- the configuration and the derived metrics;
- the current open period: start, next closing and next due date;
- the current amount to avoid interest, with its status;
- the estimate for the latest closed period;
- one page of periods, newest first, 12 per page, selected by a `page` parameter.

Each period SHALL include:
- start, closing date and due date;
- closing debt;
- credits, with their informational breakdown;
- remaining to avoid interest and on-time remaining;
- confirmed interest;
- the estimate;
- the status.

Periods SHALL range from the one containing the earlier of the account's creation and its first transaction, up to the open period. All amounts SHALL use the decimal-string contract. A non-card account or another user's account SHALL return 404. An unconfigured card SHALL return metrics with an empty period list.

#### Scenario: Summary
- **WHEN** the owner requests a configured card's billing data
- **THEN** debt, available credit, utilization, next closing, next due, the amount to avoid interest, the estimate and the first page of periods are returned

#### Scenario: Not a card or another user's card
- **WHEN** the endpoint is called for a `checking` account, or for another user's card
- **THEN** the response is 404 and no data is revealed

### Requirement: Bounded calculation cost

One billing request SHALL read the card's transactions with at most two indexed queries: one by account and one by transfer destination. It SHALL compute every boundary balance in one ordered pass, with no per-period query. It SHALL keep no state between requests.

#### Scenario: Many periods
- **WHEN** a card has 36 months of transactions and the third page of periods is requested
- **THEN** the response is computed from one ledger read for that card, with no per-period queries
