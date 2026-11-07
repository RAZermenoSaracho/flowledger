# Proposal

## Why

`Transaction.date` represents when a transaction executed, but FlowLedger treats it inconsistently: forms collect only a date, display uses local time, edits reset stored times, and filters and reports use UTC days. Users therefore see transactions on the wrong day and in the wrong month. This is roadmap batch B-001 (ST-001, Odoo task #129).

## What Changes

- **Contract:** `Transaction.date` is a UTC instant everywhere. The web app converts to and from the device's timezone, using native timezone-aware APIs.
- **Picker:** Create and edit forms use one native date-and-time field. Changing the date keeps the time, changing the time keeps the date, and unrelated edits leave the timestamp untouched.
- **Display:** The list, detail, and group views show local date and time.
- **Filters:** Web date filters on reports and every list search accept a local day with an optional time to the minute (one always-visible date-and-time field with no toggle, defaulting to 00:00 for a lower bound and 23:59 for an upper bound; incomplete entries are flagged, never dropped silently) and send UTC instants as half-open `[start, end)` intervals. A day-only value keeps whole-day semantics, and an upper bound with a time is inclusive of its displayed minute. Filter chips show the local date and time. The Reports filters are one always-visible bar with every control directly accessible at every width.
- **Reports and grouping:** Monthly cashflow and transaction-page month grouping use the client's IANA timezone. Report APIs accept an optional `timeZone`, defaulting to UTC.
- **API writes:** A bare `YYYY-MM-DD` date stays valid and means `00:00:00 UTC` on that date. A datetime with an offset is accepted and normalized to UTC. An update that omits `date` keeps the stored value.
- **API ranges:** A datetime `dateTo` becomes exclusive on reports and MCP search, and MCP date filters also accept datetimes. A bare date still means a whole UTC day.
- **Provider dates:** Imported transactions keep the provider's stored value. Exact-noon Syncfy dates are recognized through their import link and display with no time.
- **Existing data:** No migration, backfill, cleanup, or compatibility logic. Existing records are read as the UTC instants they hold, so older UTC-midnight records can show the previous local day.

## Capabilities

### New Capabilities

- `transaction-datetime`: Transaction execution date and time entry, storage contract, display, filtering, grouping, and reporting across timezones.

### Modified Capabilities

- `mcp-server`: Search and summary date filters accept datetimes, and a datetime upper bound becomes exclusive.

## Impact

- **Web:** Transaction forms and views, `searchDomain`, `FilterBuilder`, a new date-and-time filter input, Reports, and a new `utils/dateTime.ts`. `todayDateString` is removed.
- **API:** `reportFilters`, `transactionCalculations`, reports read service, MCP query and tool descriptions, imported date search, transaction and group read includes.
- **Shared schemas:** `common.ts`, `transactions.ts`, `reports.ts`, and `mcp.ts`.
- **API consumers:** Previously valid write requests stay valid. Responses gain an additive `providerImportedTransaction.transactionDate` field, and a datetime `dateTo` no longer includes that exact instant.
- **Unchanged:** No database schema change, no data migration, no new dependency, and no datasieve change.
