## ADDED Requirements

### Requirement: Per-period date overrides

The owner SHALL be able to override, independently, the closing date and the payment due date of any billing period from the first period up to and including the open one. Overrides SHALL be persisted, are the only billing input stored besides the card configuration, and SHALL NOT be changed by recalculation, reads, new periods or imports.

- A period is identified by the `YYYY-MM` of its default closing date, which stays stable when an override moves its effective dates.
- A period without an override uses the card's default cycle. The default cycle settings stay unchanged and keep applying to periods without overrides.
- The period after an overridden one SHALL start the day after the overridden closing date, so periods never overlap or leave gaps.
- A due date without its own override follows the effective closing date under `days_after_closing` and keeps its calendar rule under `day_of_next_month`.
- Setting a date to null SHALL restore that date's default.

#### Scenario: Override moves the closing date
- **WHEN** a card closes on day 20 and the period closing 2026-11-20 is overridden to close 2026-11-23
- **THEN** that period ends 2026-11-23, the next period starts 2026-11-24, and a purchase on 2026-11-22 belongs to the overridden period instead of the next one

#### Scenario: Due override is independent
- **WHEN** only the due date of the period closing 2026-11-20 is overridden to 2026-12-18
- **THEN** its closing date, its start and the adjacent periods are unchanged, and its on-time window ends 2026-12-18

#### Scenario: Overrides survive default changes and new periods
- **WHEN** the card's closing day is changed from 20 to 15 while the period closing 2026-11-20 has an override
- **THEN** that period keeps its overridden dates, periods without overrides use day 15, and the next period starts the day after the effective closing

#### Scenario: Reset
- **WHEN** the owner sets the closing date of an overridden period to null
- **THEN** the period closes on its default date, and a period with no remaining override has no stored row

#### Scenario: Short month and year boundary
- **WHEN** a card with closing day 31 has the period closing 2027-01-31 overridden to 2027-02-02
- **THEN** the following period starts 2027-02-03 and closes 2027-02-28, and the December 2026 period keeps its start, end, due date and closing debt (only its window-derived figures, such as the interest estimate window, follow the moved closing)

### Requirement: Override validation

A write SHALL be rejected with a 400 naming the problem when, after applying it, the period or either neighbour would violate any of these rules:
- closing dates strictly increase from period to period;
- the due date is after the same period's closing date; it MAY fall after the next period's closing date, because boundaries and payment deadlines are independent;
- dates are valid calendar dates (`YYYY-MM-DD`) and the period key is `YYYY-MM`.

A period after the open one SHALL be rejected. Changing the card's default cycle SHALL be rejected with a 400 when it would make any existing override violate these rules; overrides SHALL never be dropped or clamped silently.

#### Scenario: Overlap rejected
- **WHEN** the closing of the period closing 2026-11-20 is overridden to a date on or before the previous closing
- **THEN** the request fails with 400 and nothing is stored

#### Scenario: Due before closing rejected
- **WHEN** a due date on or before the period's effective closing date is submitted
- **THEN** the request fails with 400

#### Scenario: Closing before the previous period's due date
- **WHEN** the previous period is due 2026-11-18 and the owner overrides this period's closing to 2026-11-17
- **THEN** the request succeeds, the previous period's due date stays 2026-11-18 and only this period's override row is written

#### Scenario: Due date after the next closing
- **WHEN** the period closing 2026-10-19 is given the due date 2026-11-25 and the next period closes 2026-11-18
- **THEN** the request succeeds, and a payment dated 2026-11-20 counts toward both periods' figures

#### Scenario: Institution periods reproduced in any edit order
- **WHEN** a card with closing day 18 and due day 18 of the next month has the periods closing 2026-07 and 2026-10 overridden to 2026-07-20 and 2026-10-19, in either order
- **THEN** every edit succeeds with a single override row and the periods run 05-19 to 06-18, 06-19 to 07-20, 07-21 to 08-18, 08-19 to 09-18, 09-19 to 10-19 and 10-20 to 11-18 with their default due dates

#### Scenario: Default change blocked by an override
- **WHEN** a default change would put the next period's closing on or before an overridden closing
- **THEN** the account update fails with 400 naming the period, and the account is unchanged

### Requirement: Derived figures follow overrides

Allocation, closing debt, payment windows, credits, remaining to avoid interest, on-time remaining, status, estimated and confirmed interest, the open period, reminders, MCP and `/v1` output SHALL use the effective dates and remain one calculation. Changing a closing date SHALL affect only the previous period's payment window, the period itself, and the next period's start; closing debts of later periods remain the whole-ledger balance. Changing a due date SHALL affect only that period's on-time boundary, status, on-time remaining and estimate, plus its credits and remaining when the due date falls after the next closing. Editing a closed or paid period is allowed under the rules of the next requirement.

#### Scenario: Status recomputed
- **WHEN** a period due 2026-12-20 with a payment on 2026-12-22 is overridden to be due 2026-12-24
- **THEN** it is `paid` instead of `paid_late`

#### Scenario: Closing debt follows the new boundary
- **WHEN** a 2000 purchase on 2026-11-22 follows a default closing of 2026-11-20 and the closing is overridden to 2026-11-23
- **THEN** the period's closing debt includes the 2000 and the next period no longer contains it

#### Scenario: Next start follows a shortened closing
- **WHEN** period A spans 2026-10-21 to 2026-11-20, period B spans 2026-11-21 to 2026-12-20, and A's closing is overridden to 2026-11-19
- **THEN** B starts 2026-11-20, B still ends 2026-12-20, and every other period is unchanged, with no gap or overlap between consecutive periods

#### Scenario: Unrelated periods unchanged
- **WHEN** one period is overridden
- **THEN** every period other than it and its two neighbours returns identical figures

### Requirement: Override endpoint and response flags

`PATCH /accounts/:id/credit-card/periods/:key` SHALL require authentication and ownership of a `credit_card` account, accept `closingDate` and/or `dueDate` (`YYYY-MM-DD` or null; at least one field), and return the updated period. Another user's account or a non-card account SHALL return 404. Each period of `GET /accounts/:id/credit-card` SHALL include `key`, `endAdjusted`, `dueAdjusted`, `defaultEnd` and `defaultDue`.

#### Scenario: Concurrent edits
- **WHEN** two requests that are each valid but jointly invalid run at the same time
- **THEN** the validation and write run in one Serializable transaction, at most one succeeds, the other is a 400 or a 409 "retry", and the stored sequence is always valid

#### Scenario: Not the owner
- **WHEN** another user patches the period
- **THEN** the response is 404 and nothing changes

#### Scenario: Flags
- **WHEN** only the due date of a period is overridden
- **THEN** it reports `dueAdjusted` true, `endAdjusted` false, and both defaults

### Requirement: Editing closed and paid periods

Any period up to and including the open one MAY be overridden, including closed, paid and paid-late ones. An override is a pure input to the derivation: it SHALL NOT create, update or delete any transaction, payment, transfer, imported transaction, interest entry or other ledger row, and SHALL NOT change the account's initial balance or balance. Because nothing derived is persisted, every figure SHALL be recomputed from the unchanged ledger on the next read, with no stored historical value that can disagree with it. Resetting an override (null) SHALL restore exactly the figures the same ledger produced before the override, byte for byte.

When the closing date of period N is overridden, the following SHALL be recomputed and nothing else:
- period membership: the charges, credits and interest entries dated between the old and the new boundary move between period N and period N+1 (confirmed interest of N and N+1 follows entry dates);
- the closing debt of N (the ledger balance at the new closing boundary); closing debts of all other periods are unchanged because each is the whole-ledger balance at its own boundary;
- the start of N+1 (the day after the new closing);
- the payment window of N-1, which ends at the later of closing(N) and due(N-1): credits in the moved range enter or leave N-1's window, so N-1's credits, remaining, on-time remaining, status and interest estimate are recomputed (its closing debt, start, end and due date are unchanged);
- the status, remaining, on-time remaining, credits and estimate of N itself.

When the due date of period N is overridden, only N's on-time boundary (and its window end, when the due date falls after the next closing) changes: N's on-time remaining, status (for example `paid_late` to `paid`, `overdue` to `pending`, or the reverse), projected-versus-confirmed estimate and avoid-interest amount. Credits and remaining change only when the due date moves past or before the next closing; closing debt and every other period are unchanged.

Every period other than N-1, N and N+1 SHALL return output identical to the output without the override. Writes that would leave a closed or paid period inconsistent (rules of the validation requirement) SHALL be rejected rather than adjusted.

#### Scenario: Closed paid period closing moved
- **WHEN** a paid period has its closing date moved later across a 500 purchase dated in the moved range
- **THEN** its closing debt increases by 500, the next period no longer contains that purchase and starts the day after the new closing, and no transaction, payment or account balance changes

#### Scenario: Credit moves between payment windows
- **WHEN** a payment is dated on the day after the default closing and the closing is overridden to that day
- **THEN** the payment now falls inside the previous period's payment window instead of this period's, the previous period's credits, remaining and status are recomputed, this period's closing debt falls by the payment, and resetting the override restores the original figures exactly

#### Scenario: Paid-late becomes paid and back
- **WHEN** a period paid on 2026-12-22 against due 2026-12-20 (`paid_late`) has its due date overridden to 2026-12-24
- **THEN** it reports `paid`, and resetting the due date returns it to `paid_late` with the original figures

#### Scenario: Ledger untouched
- **WHEN** any override is set or reset
- **THEN** transaction, imported-transaction and account rows, and the account balance, are identical before and after

#### Scenario: Unrelated periods identical
- **WHEN** period N is overridden
- **THEN** all periods other than N-1, N and N+1 return identical output, N+1 differs only in start and confirmed interest, and N-1 only in its window-derived figures

#### Scenario: Reset is exact
- **WHEN** both dates of an overridden period are reset
- **THEN** the full billing response equals the response produced before any override, and no override row remains

## MODIFIED Requirements

### Requirement: Billing period boundaries

For a card with cycle configuration, all boundaries SHALL be computed in the card's `billingTimeZone` as half-open intervals of instants.

- **Closing date:** `statementClosingDay` of each month, or the month's last day when the month is shorter.
- **Closing boundary `close(N)`:** the start of the day after period N's closing date.
- **Period N** = [`close(N−1)`, `close(N)`). A transaction SHALL belong to the one period that contains its `date`.
- **Due date:**
  - `day_of_next_month`: day `paymentDueValue` of the month after the closing date, clamped to that month's last day.
  - `days_after_closing`: the closing date plus `paymentDueValue` days.
- **Due boundary `due(N)`:** the start of the day after the due date. Boundaries and payment deadlines are independent: it MAY exceed `close(N+1)`.
- **Payment window of period N** = [`close(N)`, max(`close(N+1)`, `due(N)`)). The on-time part is [`close(N)`, `due(N)`).

Every instant after the first closing belongs to exactly one period's boundaries. Payment windows tile the timeline unless a due boundary extends past the next closing; in that overlap a credit counts in both windows, which is correct because closing debts are cumulative: the next statement's closing debt already contains the unpaid remainder.

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

### Requirement: Payments, credits and remaining obligation

For each closed period N, the system SHALL derive these figures from transactions dated within its payment window:
- **credits** = the `destinationAmount` of transfers into the card, plus the `accountAmount` of all card income, whatever its classification;
- **remaining to avoid interest** = max(0, closing debt − credits);
- **on-time remaining** = the same figure, using only the on-time part of the window.

A transaction SHALL count at most once within any single period's window. A credit dated after `close(N+1)` and before `due(N)` reduces both period N's and period N+1's remaining amount, because closing debt N+1 includes whatever N left unpaid. Purchases and transfers out within the window SHALL NOT increase that period's remaining amount.

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

#### Scenario: Payment inside the overlap of two statements
- **WHEN** period N closes with debt 1000 and is due after the next closing, period N+1 closes with debt 1500, and 1000 is paid after `close(N+1)` and before `due(N)`
- **THEN** period N shows credits 1000, remaining 0 and `paid`, period N+1 shows credits 1000 and remaining 500, and no period counts that payment more than once
