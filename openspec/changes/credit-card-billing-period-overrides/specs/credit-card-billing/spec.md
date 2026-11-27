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
- **THEN** the following period starts 2027-02-03 and closes 2027-02-28, and the December 2026 period is unchanged

### Requirement: Override validation

A write SHALL be rejected with a 400 naming the problem when, after applying it, the period or either neighbour would violate any of these rules:
- closing dates strictly increase from period to period;
- the due date is after the same period's closing date and not after the next period's closing date;
- dates are valid calendar dates (`YYYY-MM-DD`) and the period key is `YYYY-MM`.

A period after the open one SHALL be rejected. Changing the card's default cycle SHALL be rejected with a 400 when it would make any existing override violate these rules; overrides SHALL never be dropped or clamped silently.

#### Scenario: Overlap rejected
- **WHEN** the closing of the period closing 2026-11-20 is overridden to a date on or before the previous closing
- **THEN** the request fails with 400 and nothing is stored

#### Scenario: Due before closing rejected
- **WHEN** a due date on or before the period's effective closing date is submitted
- **THEN** the request fails with 400

#### Scenario: Neighbour's due date protected
- **WHEN** the previous period is due 2026-11-18 and the owner overrides this period's closing to 2026-11-17
- **THEN** the request fails with 400

#### Scenario: Default change blocked by an override
- **WHEN** a default change would put the next period's closing on or before an overridden closing
- **THEN** the account update fails with 400 naming the period, and the account is unchanged

### Requirement: Derived figures follow overrides

Allocation, closing debt, payment windows, credits, remaining to avoid interest, on-time remaining, status, estimated and confirmed interest, the open period, reminders, MCP and `/v1` output SHALL use the effective dates and remain one calculation. Changing a closing date SHALL affect only the previous period's payment window, the period itself, and the next period's start; closing debts of later periods remain the whole-ledger balance. Changing a due date SHALL affect only that period's on-time boundary, status, on-time remaining and estimate. Editing a closed or paid period is allowed and recomputes it.

#### Scenario: Status recomputed
- **WHEN** a period due 2026-12-20 with a payment on 2026-12-22 is overridden to be due 2026-12-24
- **THEN** it is `paid` instead of `paid_late`

#### Scenario: Closing debt follows the new boundary
- **WHEN** a 2000 purchase on 2026-11-22 follows a default closing of 2026-11-20 and the closing is overridden to 2026-11-23
- **THEN** the period's closing debt includes the 2000 and the next period no longer contains it

#### Scenario: Unrelated periods unchanged
- **WHEN** one period is overridden
- **THEN** every period other than it and its two neighbours returns identical figures

### Requirement: Override endpoint and response flags

`PATCH /accounts/:id/credit-card/periods/:key` SHALL require authentication and ownership of a `credit_card` account, accept `closingDate` and/or `dueDate` (`YYYY-MM-DD` or null; at least one field), and return the updated period. Another user's account or a non-card account SHALL return 404. Each period of `GET /accounts/:id/credit-card` SHALL include `key`, `endAdjusted`, `dueAdjusted`, `defaultEnd` and `defaultDue`.

#### Scenario: Not the owner
- **WHEN** another user patches the period
- **THEN** the response is 404 and nothing changes

#### Scenario: Flags
- **WHEN** only the due date of a period is overridden
- **THEN** it reports `dueAdjusted` true, `endAdjusted` false, and both defaults
