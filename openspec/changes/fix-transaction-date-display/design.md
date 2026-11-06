# Design

## Context

See proposal.md for motivation. Current consumers of `Transaction.date`:

| Area | Current behavior | Sites |
|---|---|---|
| Web forms | Date only, always sent on edit | `TransactionCoreFields`, `TransactionFormCard`, `TransactionEditPage` |
| Web display | Local date | `TransactionList`, `TransactionDetailPage`, `GroupTransactionsSection` |
| Web filters | Bare dates sent raw | `searchDomain.leafFor`, `ReportFiltersCard` |
| Web grouping | UTC month | `TransactionsPage.tsx:159` |
| API range filters | UTC days, mixed end semantics | `reportFilters.dateRangeWhere`, `mcp/utils/transactionsQuery` |
| API imported search | UTC start, server-local next day | `importedTransactionQuery.ts:115-119` |
| API bucketing | UTC month | `transactionCalculations.ts:104`, one caller, reached by REST, `/v1`, and MCP |

Summary and by-category reports have no buckets, so they need only correct range bounds. The app has no relative or year filters today, so none need converting. Datasieve already passes ISO strings through and supports `<`. Neither app has a date library or uses an IANA timezone.

All 156 staging imported rows have `dt_transaction` at exactly UTC noon. Their other 25 provider fields hold no execution time: `dt_refresh` is the sync time, and `extra` is null. None are linked to a transaction yet. Production and other Syncfy connectors weren't inspected.

## Goals / Non-Goals

**Goals:**

- One contract, with UTC instants between every layer.
- Conversion in as few places as possible, with DST handled by native timezone data.

**Non-Goals:**

- Stored user timezones, a date library, or datasieve changes.
- Rewriting, deleting, or reinterpreting existing data.
- Timezone-aware `search_transactions` or bare-date filters for API clients. They send datetimes for local days.

## Decisions

**Local-to-UTC conversion happens only in the browser.** The new `apps/web/src/utils/dateTime.ts` uses `new Date(y, m, d)` and `new Date(localValue)`, which apply the device's timezone rules including DST. It exports:

- `formatTransactionDate(transaction)`: display string.
- `transactionDateInputValue(transaction)`: `YYYY-MM-DDTHH:mm` field value, also the source of the display month.
- `transactionDateNowInputValue()`: create default and reset value.
- `transactionDateRequestValue(inputValue, original?)`: `undefined` if unchanged, otherwise a UTC ISO string keeping the original's seconds and milliseconds.
- `localDayStartInstant(day, addDays?)`: UTC ISO start of a local calendar day, used for range bounds.

*Alternative:* send bare dates plus `timeZone`, with the server computing boundaries. Rejected because local-to-UTC conversion on the server needs a hand-written DST-aware inverse or a library, and datasieve queries are built on the client anyway.

**The server only converts UTC to a month.** `calculateMonthlyCashflow` takes `timeZone` and buckets using `Intl.DateTimeFormat(...).formatToParts`, which is DST-correct and has no dependency. `timeZone` joins `reportFiltersSchema` as an optional field, validated by constructing an `Intl.DateTimeFormat`. It also joins MCP's `getReportToolSchema`. It stays on the shared filter schema for all report routes, and only the cashflow report uses it.

**`reports.client.ts` adds the device timezone on cashflow requests.** This covers Reports and Dashboard in one place. Filter conversion happens in `ReportsPage`, because client files only build requests.

**Web filters convert in `searchDomain.leafFor`.** Date values are either `YYYY-MM-DD` (whole local day, the only form that existed before) or `YYYY-MM-DDTHH:mm`. One `dateTime.ts` helper, `filterBoundInstant(value, "start" | "end")`, returns the UTC ISO instant: for a day it is `localDayStartInstant(day)` or the next day's start, and for a time it is `new Date(value)` or that plus 60 000 ms. Adding an absolute minute is DST-safe. Seconds are always `:00` because the field has minute precision, so `<= 2:30 PM` compiles to `< 2:31:00.000 PM` and includes a stored `2:30:45`.

| Operator | Compiled condition |
|---|---|
| `>=` | `>= filterBoundInstant(v, "start")` |
| `<=` | `< filterBoundInstant(v, "end")` |
| `between` [a, b] | `and` of `>=` start of `a` and `<` end of `b` |

This one branch covers every `type: "date"` field (`date`, `createdAt`, `updatedAt`, imported `transactionDate`, and the Accounts, Groups, and Shared Expenses timestamps), because they share `FieldType` and `leafFor`. Per-field exceptions would add a flag for no user benefit. No filter state is persisted in URLs or saved queries today, so bare-date compatibility is only the in-memory form, kept by the same branch. `ReportsPage` uses the same helper for `dateFrom` and `dateTo`; the API already treats a datetime `dateTo` as exclusive.

**Date-only intent: native date plus optional native time, not `datetime-local`.** Chrome reports `""` for a `datetime-local` whose segments are only partly filled, so choosing a day alone would leave the filter silently incomplete and `isValueComplete` would drop it. A new `components/DateTimeFilterInput.tsx` renders `<input type="date">` and `<input type="time">`, both controlled by one string value. The time input is disabled until a date exists, so there is no invalid state. A time-only or partial time (`""`) falls back to the bare date. The time input gives the same hour, minute, and AM or PM segments as the form. `FilterBuilder` (value, From, To) and `ReportFiltersCard` (From, To) both use it. React does not rewrite an equal `""` value, so a half-typed time is not reset; browser QA covers this.

*Alternative:* one `datetime-local` plus a "whole day" toggle. Rejected: one more control and state for the common case.

**Chips format local values.** `dateTime.ts` adds `formatFilterValue(value)`: date-only with `toLocaleDateString`, with time via `toLocaleString` hour and minute. `conditionValueText` calls it for date-typed fields so chips and summaries never show raw ISO text.

**One API helper for exclusive upper bounds.** A small helper in `apps/api/src/utils/` returns the next UTC day for a bare `dateTo` and the instant itself for a datetime. `dateRangeWhere` and `transactionsQuery` both use it with `lt` and `<`. The imported free-text date search stays a UTC-day search, with its `setDate` call corrected to `setUTCDate`.

*Alternative:* keep `lte`. Rejected because half-open intervals are the required contract.

**Keep date-only write requests valid.** The shared `date` field and date filters accept a bare date or `z.string().datetime({ offset: true })`. `new Date(...)` already turns a bare date into UTC midnight and an offset datetime into its UTC instant, so services need no write-path change. The web app always sends a full UTC instant, and MCP tool descriptions state the accepted formats.

*Alternative:* reject bare dates. Rejected to preserve existing API and MCP clients.

**Provider dates: explicit policy by provenance.** The stored value stays as provided. Transaction list, detail, and group reads add `providerImportedTransaction: { select: { transactionDate: true } }`. `formatTransactionDate` omits the time only when that linked value equals `date` and is exactly UTC noon, so a manual 6:00 AM entry at UTC-6 still shows its time. `ImportedTransactionCard` needs no change, because it already shows a local date with no time.

Using the local date for display and the stored instant for filters keeps these rows consistent with each other. A viewer at UTC+12 or beyond sees the next calendar day.

*Alternative:* treat exact noon as date-only with no import link. It's simpler, but it hides real entered times.

**No compatibility for older records.** Existing records are read as the instants they hold, with no special handling for values at UTC midnight.

*Alternative:* treat exact UTC midnight as date-only. Rejected because 6:00 PM at UTC-6 is a real time at that same instant, and telling them apart would need a workaround or a marker column.

## Risks / Trade-offs

- [Older UTC-midnight records show the previous day, and those on the first of a month count in the previous month, in negative offsets] → Accepted. It affects at least 16 of 44 staging transactions, and production wasn't inspected. Nothing in this change deletes or rewrites data.
- [API and MCP date-only writes still create UTC-midnight instants, which show the previous day in negative offsets] → This is the requested compatible behavior, and tool descriptions state it.
- [Datetime `dateTo` moves from inclusive to exclusive on report APIs] → The difference is one exact instant. Web clients change in the same PR.
- [Viewers in different timezones see different dates, totals, and months for the same records] → This follows from client-local semantics. API defaults remain UTC unless a client passes `timeZone` or instants.
- [A nonexistent local time in a DST gap is entered] → The browser resolves it to a real instant, and the field then shows the resolved time on reload.
- [The picker shows the stored instant's local time for an unedited provider date, such as 6:00 AM] → `datetime-local` requires a time. An unrelated edit preserves the value. Changing the field makes that entered time real.
- [Provider noon is confirmed only in staging] → A provider value at another time displays as a real time.
- [Datasieve may not accept a nested `select` through its transaction `include`] → Task 6.1 verifies this first. If it doesn't, the API maps the field after the query.

## Migration Plan

No data migration. One PR targets `razs_ai`. Rollback reverts it, and instants saved in the meantime remain valid.
