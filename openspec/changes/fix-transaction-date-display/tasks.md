# Tasks

## 1. API range semantics and write contract

- [x] 1.1 Accept offset datetimes in the shared `date` field and `optionalDateStringSchema`, with tests in `packages/shared`. Verify through `create.service` and route tests that a bare date stores UTC midnight, an offset datetime normalizes to UTC, and an update without `date` keeps the stored value.
- [x] 1.2 Add the exclusive-upper-bound helper in `apps/api/src/utils/` with its `tests/` file, and use it in `dateRangeWhere`. Update `reportFilters.test.ts` and verify the bare and datetime `dateTo` scenarios pass.
- [x] 1.3 Accept datetimes in MCP `dateFrom` and `dateTo`, compile with `>=` and `<` in `transactionsQuery.ts`, and update tool descriptions for filters and writes. Update `transactionsQuery.test.ts` and `mcp.integration.test.ts`, and verify the `mcp-server` scenarios pass.
- [x] 1.4 Change `setDate` to `setUTCDate` in `importedTransactionQuery.ts`, and verify in `importedTransactionQuery.test.ts` that the search range is one UTC day under a non-UTC `TZ`.

## 2. Timezone-aware reports

- [x] 2.1 Add an optional validated `timeZone` to `reportFiltersSchema` and MCP's `getReportToolSchema`, with tests in `packages/shared`. Verify `Not/AZone` is rejected and valid zones pass.
- [x] 2.2 Bucket `calculateMonthlyCashflow` by `timeZone`, passed from `getMonthlyCashflowReport`. In `transactionCalculations.test.ts`, verify the `America/Mexico_City`, `Australia/Sydney`, and default UTC month-boundary scenarios, plus a DST-boundary instant.
- [x] 2.3 Verify end to end in `reports.routes.test.ts` and `/v1` route coverage that `timeZone` changes monthly buckets and an invalid value returns 400.

## 3. Web filters and grouping

- [x] 3.1 Add `apps/web/src/utils/dateTime.ts` with `localDayStartInstant` and `transactionDateInputValue`, and `tests/dateTime.test.ts` covering `America/Mexico_City`, `Pacific/Kiritimati`, and both `America/Los_Angeles` DST days. Verify `utils/` coverage stays at or above 90%.
- [x] 3.2 Compile date fields through local-day boundaries in `searchDomain.leafFor`, and verify `>=`, `<=`, and `between` output in `searchDomain.test.ts`, including `isNull` and non-date fields unchanged.
- [x] 3.3 Convert Reports date filters in `ReportsPage.tsx` and add the device `timeZone` in `reports.client.ts`. Verify through msw request assertions in the `ReportsPage` and Dashboard tests.
- [x] 3.4 Base month grouping at `TransactionsPage.tsx:159` on `transactionDateInputValue`, and verify the UTC-6 month-boundary scenario in `TransactionsPage.test.tsx`.

## 4. Provider-date reads

- [x] 4.1 Add `providerImportedTransaction.transactionDate` to list, detail, and group transaction reads and the web `Transaction` type, first confirming datasieve accepts the nested select. Verify in `read.service` tests and an integration test that only the owner's data is returned.

## 5. Entry and display

- [x] 5.1 Add `formatTransactionDate`, `transactionDateNowInputValue`, and `transactionDateRequestValue` to `dateTime.ts`, with tests for timed and provider-date display, date-only and time-only edits keeping sub-minute precision, a DST date change, and unchanged and restored values. Verify `utils/` coverage stays at or above 90%.
- [x] 5.2 Use `formatTransactionDate` in `TransactionList`, `TransactionDetailPage`, and `GroupTransactionsSection`, and assert local date and time at positive and negative offsets in each test file. Verify the provider-date case shows no time.
- [x] 5.3 Change `TransactionCoreFields` and `TransactionFormCard` to one `datetime-local` field defaulting to now, with "Reset to now". Verify through msw that a new transaction sends the expected UTC instant.
- [x] 5.4 Change `TransactionEditPage` to the same field and helpers. Verify through msw bodies the date-only, time-only, DST, unrelated, and restored scenarios.
- [x] 5.5 Remove `todayDateString` and its tests, and extend the iOS rule in `index.css` to `input[type="datetime-local"]`. Verify `grep -r todayDateString apps/web/src` returns nothing and the field fits at mobile width.
- [x] 5.6 Add an assertion to `NotificationsMenu.test.tsx` that a UTC-midnight `createdAt` keeps local display, leaving `NotificationsMenu.tsx` unchanged. Verify the test passes.

## 6. Docs and verification

- [x] 6.1 Update `docs/DOMAIN_LOGIC.md` with the UTC instant, filter, and `timeZone` contracts, and log older UTC-midnight records and provider-date limits in `docs/KNOWN_ISSUES.md`. Verify by reviewing the diff.
- [x] 6.2 Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:coverage -w apps/web`, `npm run build`, and the Docker-backed integration suites, and verify that all pass.
- [x] 6.3 In the running app with browser timezones emulated at UTC-6, a positive offset, and a DST zone, verify create, display, independent date and time edits, unchanged timestamps, date-only requests, filters, and monthly reports. Remove any test records created, and stop every browser process started for this QA.

## 7. Date and time in filters (follow-up; groups here own only the files named)

- [x] 7.1 Extend `apps/web/src/utils/dateTime.ts` with `filterBoundInstant` and `formatFilterValue`, with cases in `utils/tests/dateTime.test.ts` for day and time values, `America/Mexico_City`, `Pacific/Kiritimati`, both `America/Los_Angeles` DST days, an upper bound crossing a DST gap, and en-US chip text. Verify the scenarios "Inclusive upper minute", "Lower minute", "Range with times", and "Mixed day and time bounds" pass and `utils/` coverage stays at or above 90%.
- [x] 7.2 In `searchDomain.ts`, compile date conditions with `filterBoundInstant` and format date values in `conditionValueText`; update `utils/tests/searchDomain.test.ts` to verify day-only output is unchanged, time output is as specified, `isNull` and non-date fields are unchanged, and chip text is localized.
- [x] 7.3 Add `components/DateTimeFilterInput.tsx` with `components/tests/DateTimeFilterInput.test.tsx`. Verify date-only emits a bare date, time is disabled without a date, adding a time emits `YYYY-MM-DDTHH:mm`, and clearing the time returns the bare date.
- [x] 7.4 Use it in `FilterBuilder.tsx` for date value, From and To, and update `components/tests/FilterBuilder.test.tsx`. Verify applying a day-only and a timed condition yields complete conditions.
- [x] 7.5 Use it in `ReportFiltersCard.tsx` and compile `dateFrom` and `dateTo` in `ReportsPage.tsx` with `filterBoundInstant`; update both test files. Verify through msw request assertions the "Reports upper bound with time" and "Reports day only" scenarios, and that grouping and totals are unchanged.
- [x] 7.6 Update `docs/DOMAIN_LOGIC.md` with the filter value forms and inclusive-minute rule. Verify by reviewing the diff.
- [x] 7.7 After tasks 7.1 to 7.6, in the running app at UTC-6, verify in Chrome that choosing only a date filters the whole day on Transactions and Reports, a time-bounded range is correct, chips read clearly, and the Imported tab works; stop any browser started and remove test records.

## 8. Single-field filter datetime and compact Reports filters (follow-up)

- [x] 8.1 Rework `components/DateTimeFilterInput.tsx` into one `date` or `datetime-local` input with a "Specific time" checkbox seeding `00:00` or `23:59`, and flagging partial or non-four-digit-year entries as "Incomplete or invalid, not applied". Verify in `tests/DateTimeFilterInput.test.tsx` that seeding happens only on the toggle, focus and tab emit nothing, partial entries emit `""` and show the message, and a bare date still renders.
- [x] 8.2 Pass `defaultTime` from `FilterBuilder.tsx` (`<=` and between To use `23:59`) and update `components/tests/FilterBuilder.test.tsx` for the single field. Verify day-only and timed conditions stay complete.
- [x] 8.3 Replace `ReportFiltersCard.tsx` with a compact toolbar and Filters popover with an active summary, and update `ReportFiltersCard.test.tsx` and `ReportsPage.test.tsx`. Verify the msw request assertions still show the same `dateFrom` and `dateTo` instants, including "day then specific time" equal to day-only.
- [x] 8.4 Update `docs/DOMAIN_LOGIC.md` for the single-field input. Verify by reviewing the diff.
- [x] 8.5 In Chrome with `America/Mexico_City`, `Pacific/Kiritimati`, and both `America/Los_Angeles` DST days, verify request instants for at least, at most, between, and day-only; verify keyboard entry, a partly filled field, and the Reports layout at 360 to 1920 px in light and dark. Remove QA data and stop browsers.

