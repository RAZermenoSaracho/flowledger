# Spec Delta

## Purpose

Defines how a transaction's execution date and time are entered, stored as a UTC instant, displayed, filtered, grouped, and reported consistently in the client's timezone.

## ADDED Requirements

### Requirement: Execution time is a UTC instant

`Transaction.date` SHALL hold the transaction's execution time as a UTC instant. Transaction create and update requests SHALL accept `date` as a bare `YYYY-MM-DD` date, a UTC datetime, or a datetime with an offset, on the web API, `/v1`, and MCP. A bare date SHALL mean `00:00:00 UTC` on that date, and an offset datetime SHALL be normalized to UTC. Update requests MAY omit `date`, and existing records SHALL be read as the UTC instants they hold.

#### Scenario: Web entry converted to UTC

- **WHEN** a user at UTC-6 saves November 5, 2026, 2:30 PM
- **THEN** the request sends `2026-11-05T20:30:00.000Z`
- **AND** `Transaction.date` stores that instant

#### Scenario: Date-only request

- **WHEN** a client creates or updates a transaction with `date` set to `2026-11-05`
- **THEN** `Transaction.date` stores `2026-11-05T00:00:00.000Z`

#### Scenario: Offset datetime normalized

- **WHEN** a client creates or updates a transaction with `date` set to `2026-11-05T14:30:00-06:00`
- **THEN** `Transaction.date` stores `2026-11-05T20:30:00.000Z`

#### Scenario: Update omits the date

- **WHEN** a client updates a transaction stored as `2026-05-31T21:33:15.979Z` without sending `date`
- **THEN** the stored value is unchanged

### Requirement: One date-and-time field

The transaction create and edit forms SHALL provide one field for both date and time, in the device's timezone. A new transaction SHALL default to the current date and time.

#### Scenario: New transaction default

- **WHEN** a user opens the create form at 3:33 PM on November 5, 2026 local time
- **THEN** the field contains November 5, 2026, 3:33 PM

### Requirement: Date and time edit independently

The edit form SHALL prefill the date and time shown by the display views. Changing only the date SHALL keep the local time of day, and changing only the time SHALL keep the local date. Precision below one minute SHALL be kept.

#### Scenario: Prefill

- **WHEN** a transaction stored as `2026-05-31T21:33:15.979Z` is opened for editing at UTC-6
- **THEN** the field contains May 31, 2026, 3:33 PM

#### Scenario: Only the date changes

- **WHEN** the user at UTC-6 changes that field to June 2, 2026, 3:33 PM and saves
- **THEN** the request sends `2026-06-02T21:33:15.979Z`

#### Scenario: Only the time changes

- **WHEN** the user at UTC-6 changes that field to May 31, 2026, 4:45 PM and saves
- **THEN** the request sends `2026-05-31T22:45:15.979Z`

#### Scenario: Date change across DST keeps local time

- **WHEN** a user in `America/Los_Angeles` changes a transaction from March 7, 2026, 9:00 AM to March 9, 2026, 9:00 AM
- **THEN** the request sends `2026-03-09T16:00:00.000Z`

### Requirement: Unrelated edits preserve the timestamp

Saving the edit form SHALL NOT send `date` when the field matches its prefilled value.

#### Scenario: Only the notes change

- **WHEN** the user changes only the notes on a transaction stored as `2026-05-31T21:33:15.979Z` and saves
- **THEN** the update request omits `date`
- **AND** the stored value remains `2026-05-31T21:33:15.979Z`

#### Scenario: Field changed and restored

- **WHEN** the user changes the field, restores the prefilled value, and saves
- **THEN** the update request omits `date`

### Requirement: Local date and time display

The transaction list, detail, and group views SHALL display `Transaction.date` as date and time in the device's timezone. Timestamps that are not transaction dates SHALL keep their existing display.

#### Scenario: Negative offset

- **WHEN** a transaction stored as `2026-11-06T03:00:00.000Z` is viewed at UTC-6
- **THEN** it displays as November 5, 2026, 9:00 PM

#### Scenario: Positive offset

- **WHEN** the same transaction is viewed at UTC+14
- **THEN** it displays as November 6, 2026, 5:00 PM

#### Scenario: Existing UTC-midnight record

- **WHEN** a transaction stored as `2026-11-05T00:00:00.000Z` is viewed at UTC-6
- **THEN** it displays as November 4, 2026, 6:00 PM
- **AND** its stored value is unchanged

### Requirement: Provider dates show no invented time

A provider `transactionDate` at exactly UTC noon SHALL be treated as a provider date with no known execution time. The stored value SHALL be kept as provided. A transaction whose `date` still equals that linked value SHALL display its local calendar date with no time. It SHALL be filtered, grouped, and reported as the instant it holds.

#### Scenario: Imported transaction not edited

- **WHEN** a transaction imported with `2026-06-04T12:00:00.000Z` keeps that value and is viewed at UTC-6
- **THEN** it displays as June 4, 2026 with no time

#### Scenario: User gives an imported transaction a time

- **WHEN** the user changes that transaction's date-and-time field and saves
- **THEN** it stores the entered instant and displays its date and time

#### Scenario: Manual entry at the same instant

- **WHEN** a manual transaction with no import link stores `2026-06-04T12:00:00.000Z` and is viewed at UTC-6
- **THEN** it displays as June 4, 2026, 6:00 AM

### Requirement: Web date filters use local boundaries

Date filters in the web transaction search, imported-transaction search, other list searches, and Reports SHALL accept a local calendar day, with an optional local time to the minute. A value without a time (`YYYY-MM-DD`) SHALL cover whole local days: a lower bound starts at the start of its local day, and an upper bound includes that whole day. A value with a time (`YYYY-MM-DDTHH:mm`) SHALL be converted to a UTC instant: a lower bound is inclusive from that minute, and an upper bound is inclusive of its displayed minute, meaning everything before the start of the following minute, whatever the stored seconds. Compiled ranges SHALL be half-open `[start, end)` in UTC. This SHALL apply to every date-typed filter field, including `date`, `createdAt`, `updatedAt`, and imported `transactionDate`.

#### Scenario: Selected day at UTC+14

- **WHEN** a user in `Pacific/Kiritimati` filters from November 5 through November 5, 2026, with no times
- **THEN** the query uses `>= 2026-11-04T10:00:00.000Z` and `< 2026-11-05T10:00:00.000Z`

#### Scenario: Evening transaction in a negative offset

- **WHEN** a user at UTC-6 filters on November 5, 2026, with no times, and a transaction is stored as `2026-11-06T02:00:00.000Z`
- **THEN** the transaction is included

#### Scenario: Short DST day

- **WHEN** a user in `America/Los_Angeles` filters on March 8, 2026, with no times
- **THEN** the query uses `>= 2026-03-08T08:00:00.000Z` and `< 2026-03-09T07:00:00.000Z`

#### Scenario: Long DST day

- **WHEN** a user in `America/Los_Angeles` filters on November 1, 2026, with no times
- **THEN** the query uses `>= 2026-11-01T07:00:00.000Z` and `< 2026-11-02T08:00:00.000Z`

#### Scenario: Inclusive upper minute

- **WHEN** a user at UTC-6 filters "at most" November 5, 2026, 2:30 PM
- **THEN** the query uses `< 2026-11-05T20:31:00.000Z`
- **AND** a transaction stored as `2026-11-05T20:30:45.000Z` is included and one stored as `2026-11-05T20:31:00.000Z` is not

#### Scenario: Lower minute

- **WHEN** a user at UTC-6 filters "at least" November 5, 2026, 2:30 PM
- **THEN** the query uses `>= 2026-11-05T20:30:00.000Z`

#### Scenario: Range with times

- **WHEN** a user filters between November 5, 2026, 9:00 AM and November 5, 2026, 5:00 PM at UTC-6
- **THEN** the query uses `>= 2026-11-05T15:00:00.000Z` and `< 2026-11-05T23:01:00.000Z`

#### Scenario: Mixed day and time bounds

- **WHEN** a user at UTC-6 filters between November 5, 2026 with no time and November 6, 2026, 8:00 AM
- **THEN** the query uses `>= 2026-11-05T06:00:00.000Z` and `< 2026-11-06T14:01:00.000Z`

### Requirement: Date filter input keeps day-only intent

The date filter control SHALL be a native date field followed by an optional native time field, in the device's locale, so the time uses the same hour, minute, and AM or PM segments as the transaction form. Choosing only a date SHALL be a complete filter that covers the whole day. The time field SHALL be disabled until a date is chosen, and clearing it SHALL return the filter to the whole day. A partially filled single `datetime-local` field reports an empty value in Chrome, so it is not used for filters.

#### Scenario: Date without time

- **WHEN** a user chooses only November 5, 2026
- **THEN** the filter is complete and covers that whole local day

#### Scenario: Time before date

- **WHEN** no date is chosen
- **THEN** the time field is disabled

#### Scenario: Clearing the time

- **WHEN** a user clears the time field after choosing 2:30 PM
- **THEN** the filter value is the bare date and covers the whole day

### Requirement: Date filter chips show local date and time

A filter chip for a date condition SHALL show the value in the device's locale: the date alone for a day-only value, and the date with hour, minute, and AM or PM for a value with a time. Raw `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm` text SHALL NOT be shown.

#### Scenario: Chip with time

- **WHEN** a user in an en-US locale applies "at most" November 5, 2026, 2:30 PM
- **THEN** the chip reads "Date is at most 11/5/2026, 2:30 PM" (field label from the page)

#### Scenario: Chip without time

- **WHEN** the value is `2026-11-05`
- **THEN** the chip shows the date only

### Requirement: Reports date filters accept date and time

The Reports From and To filters SHALL use the same input and local-to-UTC rules as list filters. `dateFrom` SHALL be inclusive and `dateTo` SHALL be sent as an exclusive instant, so a To of 2:30 PM includes transactions through 2:30:59.999 PM. Grouping, calculations, and API acceptance of bare dates SHALL be unchanged.

#### Scenario: Reports upper bound with time

- **WHEN** a user at UTC-6 sets To to November 5, 2026, 2:30 PM
- **THEN** the report request sends `dateTo` of `2026-11-05T20:31:00.000Z`

#### Scenario: Reports day only

- **WHEN** a user at UTC-6 sets From and To to November 5, 2026 with no times
- **THEN** the request sends `dateFrom` of `2026-11-05T06:00:00.000Z` and `dateTo` of `2026-11-06T06:00:00.000Z`

### Requirement: Report API date range semantics

Report APIs SHALL include `dateFrom` and exclude a datetime `dateTo`. A bare date SHALL mean a UTC calendar day, so a bare `dateTo` includes that whole UTC day.

#### Scenario: Datetime upper bound

- **WHEN** a report is requested with `dateTo` of `2026-11-06T06:00:00.000Z`
- **THEN** a transaction at exactly that instant is excluded

#### Scenario: Bare upper bound

- **WHEN** a report is requested with `dateTo` of `2026-11-05`
- **THEN** a transaction at `2026-11-05T23:59:59.999Z` is included
- **AND** a transaction at `2026-11-06T00:00:00.000Z` is excluded

### Requirement: Reports and grouping use the client timezone

Monthly cashflow reports SHALL accept an optional IANA `timeZone`, defaulting to `UTC`, and SHALL bucket each transaction by its calendar month in that timezone. Invalid timezones SHALL be rejected. The web app SHALL send the device's timezone, and transaction-page month grouping SHALL use the month of the displayed date.

#### Scenario: Negative offset at a month boundary

- **WHEN** a cashflow report with `timeZone` of `America/Mexico_City` includes a transaction at `2026-06-01T03:00:00.000Z`
- **THEN** the transaction counts under `2026-05`

#### Scenario: Positive offset at a month boundary

- **WHEN** a cashflow report with `timeZone` of `Australia/Sydney` includes a transaction at `2026-05-31T15:00:00.000Z`
- **THEN** the transaction counts under `2026-06`

#### Scenario: No timezone supplied

- **WHEN** an API client requests a cashflow report without `timeZone`, including a transaction at `2026-06-01T03:00:00.000Z`
- **THEN** the transaction counts under `2026-06`

#### Scenario: Invalid timezone

- **WHEN** a report is requested with `timeZone` of `Not/AZone`
- **THEN** the request is rejected with a validation error

#### Scenario: Web month grouping

- **WHEN** a transaction at `2026-06-01T03:00:00.000Z` is grouped by month on the transactions page at UTC-6
- **THEN** it appears under `2026-05`
