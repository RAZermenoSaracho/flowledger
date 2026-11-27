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

Allocation, closing debt, payment windows, credits, remaining to avoid interest, on-time remaining, status, estimated and confirmed interest, the open period, reminders, MCP and `/v1` output SHALL use the effective dates and remain one calculation. Changing a closing date SHALL affect only the previous period's payment window, the period itself, and the next period's start; closing debts of later periods remain the whole-ledger balance. Changing a due date SHALL affect only that period's on-time boundary, status, on-time remaining and estimate. Editing a closed or paid period is allowed under the rules of the next requirement.

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

### Requirement: Editing closed and paid periods

Any period up to and including the open one MAY be overridden, including closed, paid and paid-late ones. An override is a pure input to the derivation: it SHALL NOT create, update or delete any transaction, payment, transfer, imported transaction, interest entry or other ledger row, and SHALL NOT change the account's initial balance or balance. Because nothing derived is persisted, every figure SHALL be recomputed from the unchanged ledger on the next read, with no stored historical value that can disagree with it. Resetting an override (null) SHALL restore exactly the figures the same ledger produced before the override, byte for byte.

When the closing date of period N is overridden, the following SHALL be recomputed and nothing else:
- period membership: the charges, credits and interest entries dated between the old and the new boundary move between period N and period N+1 (confirmed interest of N and N+1 follows entry dates);
- the closing debt of N (the ledger balance at the new closing boundary); closing debts of all other periods are unchanged because each is the whole-ledger balance at its own boundary;
- the start of N+1 (the day after the new closing);
- the payment window of N-1, which ends at closing(N): credits in the moved range enter or leave N-1's window, so N-1's credits, remaining, on-time remaining, status and interest estimate are recomputed (its closing debt, start, end and due date are unchanged);
- the status, remaining, on-time remaining, credits and estimate of N itself.

When the due date of period N is overridden, only the on-time boundary of N changes: N's on-time remaining, status (for example `paid_late` to `paid`, `overdue` to `pending`, or the reverse), projected-versus-confirmed estimate and avoid-interest amount. Credits, remaining, closing debt and every other period are unchanged.

Every period other than N-1, N and N+1 SHALL return output identical to the output without the override. Writes that would leave a closed or paid period inconsistent (rules of the validation requirement) SHALL be rejected rather than adjusted.

#### Scenario: Closed paid period closing moved
- **WHEN** a paid period has its closing date moved later across a 500 purchase dated in the moved range
- **THEN** its closing debt increases by 500, the next period no longer contains that purchase and starts the day after the new closing, and no transaction, payment or account balance changes

#### Scenario: Credit moves between payment windows
- **WHEN** a payment is dated on the day after the default closing and the closing is overridden to that day
- **THEN** the payment now falls before the overridden closing and no longer counts as a credit of that period's payment window, the previous period's window figures are recomputed, and resetting the override restores the original figures exactly

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
