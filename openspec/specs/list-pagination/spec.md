# list-pagination Specification

## Purpose
Server-side, bounded and stable pagination for FlowLedger's transaction list views, with one shared pagination control in the web app.

## Requirements

### Requirement: Paginated list queries are bounded and stable
Every paginated list query SHALL apply the caller's authorization scope and filters before paging, SHALL clamp the requested page size to that list's maximum, and SHALL order results deterministically: the requested sort followed by `id` (in the direction of the last sort key, descending when no sort is given). A page number or page size that is not a positive integer SHALL be rejected with 400. A page past the end SHALL return no rows with the correct total.

#### Scenario: Stable order across pages
- **WHEN** more transactions than one page share the same date and the user pages through them sorted by date
- **THEN** every transaction appears exactly once across the pages

#### Scenario: Oversized page
- **WHEN** a client requests a page size above the list's maximum
- **THEN** at most the maximum number of rows is returned and the meta reports the clamped page size

#### Scenario: Invalid pagination
- **WHEN** a client sends page 0, a negative or fractional page size, or a non-numeric page
- **THEN** the response is 400 and no rows are returned

#### Scenario: Out-of-range page
- **WHEN** a client requests a page beyond the last
- **THEN** the response has no rows and the full total

#### Scenario: No cross-user rows
- **WHEN** two users have transactions and one pages through a filter that would match both
- **THEN** the total and rows include only the caller's transactions

### Requirement: Transactions list is server-paginated
The web Transactions list SHALL request one window at a time (50 rows by default) with the current search, filters and sort, and SHALL show the server's total. Changing the search, filters or sort SHALL return to the first row (offset 0) and keep the window size. Moving between windows SHALL keep the search, filters and sort. Group-by buckets SHALL apply to the rows of the current window.

#### Scenario: Next page keeps filters
- **WHEN** the user filters by an account and presses Next
- **THEN** the next window of the same filtered, sorted result is requested and shown

#### Scenario: Filter change resets page
- **WHEN** the user is viewing 101-150 and changes the search
- **THEN** the first window of the new result is requested with the same limit

#### Scenario: Total from the server
- **WHEN** 120 transactions match and the window is 50
- **THEN** the pager shows the range "1-50 / 120"

### Requirement: Imported Transactions list is server-paginated
The imported-transactions list endpoint SHALL accept optional pagination. With pagination it SHALL return only that window and `total` SHALL remain the full match count. Without pagination the response SHALL be unchanged. The web Imported Transactions tab SHALL request windows of 50 by default using the range kind. "Select all filtered" batch actions SHALL still apply to every matching row, not only the visible window.

#### Scenario: Paged imported list
- **WHEN** 70 imported transactions match and the web tab requests offset 50 with limit 50
- **THEN** 20 rows are returned with `total` 70 and `pendingCount` unchanged

#### Scenario: Legacy callers unchanged
- **WHEN** `/v1/imported-transactions` or the MCP `list_imported_transactions` tool is called without pagination
- **THEN** the response has the same shape and totals as before

#### Scenario: Select all filtered spans pages
- **WHEN** the user selects all filtered pending rows in the first window of 50 of 70 and imports them
- **THEN** every matching row, including those outside the window, is imported

#### Scenario: Custom window
- **WHEN** the user edits the range to 7-26 on the Imported Transactions tab
- **THEN** offset 6 with limit 20 is requested and rows 7 to 26 are shown

### Requirement: Shared pagination control
Paginated web lists SHALL use one pagination control, placed at the top right of the list header rather than below the list. It SHALL show the visible range and total as "start-end / total" (just "start-end" when the total is unknown) with Previous and Next buttons, and SHALL NOT show "Page X of Y" or a page-size selector. When the total is 0 the control SHALL NOT be shown. Previous SHALL move back by the current window size (not below the first row) and Next SHALL move forward by it, preserving a non-standard start. Previous SHALL be disabled at the first row, Next SHALL be disabled when no more rows exist, and both SHALL be disabled while a window is loading, with no wrap-around. The previous window's rows SHALL stay visible while the next one loads. When the current offset falls at or beyond the total (for example after a deletion) the list SHALL move to the last full window. The user's window size SHALL be remembered per list (see list-view window-size persistence); the offset SHALL NOT. The control SHALL fit a 320px-wide screen without horizontal scrolling.

#### Scenario: Range format
- **WHEN** rows 51 to 100 of a 312-row result are shown
- **THEN** the control shows "51-100 / 312"

#### Scenario: Last range is clamped
- **WHEN** rows 301 to 312 of 312 are shown with a window of 50
- **THEN** the control shows "301-312 / 312"

#### Scenario: Unknown total
- **WHEN** the total is unknown
- **THEN** the control shows only the range

#### Scenario: Empty result
- **WHEN** the total is 0
- **THEN** no pager is shown

#### Scenario: Ends disabled
- **WHEN** the window starts at the first row, or reaches the last row
- **THEN** Previous, or Next respectively, is disabled and neither wraps around

#### Scenario: Nonstandard start preserved
- **WHEN** the window is 7-26 and the user presses Next, then Previous twice
- **THEN** the ranges are 27-46, then 7-26, then 1-20

#### Scenario: Last page after deletion
- **WHEN** the user deletes the only row of the last window
- **THEN** the list shows the last full window of the new total

#### Scenario: Mobile width
- **WHEN** a paginated list is shown at 320px
- **THEN** the pagination control fits without horizontal scrolling

### Requirement: Range pagination request
Paginated list queries SHALL also accept a range window `{ kind: "range", offset, limit }` where `offset` is an integer of at least 0 and `limit` an integer of at least 1. The response SHALL contain exactly the rows at positions `offset` to `offset + limit - 1` of the filtered, deterministically ordered result, and the meta SHALL report `total`, `hasNext` (true when `offset + limit < total`) and `hasPrevious` (true when `offset > 0`). `limit` SHALL be clamped to the list's maximum like a page size. A negative or fractional `offset`, or a `limit` below 1 or fractional, SHALL be rejected with 400. An `offset` at or beyond `total` SHALL return no rows with the full total. The existing page and cursor kinds SHALL behave as before. Public `/v1` and MCP inputs SHALL NOT gain this kind.

#### Scenario: Arbitrary window
- **WHEN** 312 transactions match and a client requests `{ kind: "range", offset: 6, limit: 20 }`
- **THEN** the 7th to 26th rows are returned with `total` 312 and `hasPrevious` true

#### Scenario: Window past the end
- **WHEN** a client requests a range whose offset is beyond the total
- **THEN** no rows are returned and the full total is reported

#### Scenario: Oversized limit
- **WHEN** a client requests a `limit` above the list's maximum
- **THEN** at most the maximum number of rows is returned

#### Scenario: Invalid range
- **WHEN** a client sends a negative `offset` or a `limit` of 0
- **THEN** the response is 400 and no rows are returned

#### Scenario: Page kind unchanged
- **WHEN** a client sends `{ kind: "offset", page: 2, pageSize: 50 }`
- **THEN** the response is the same as before this change

### Requirement: Editable range
Clicking the range, or pressing Enter or Space on it, SHALL replace it with a text input prefilled with the current range (for example "41-80"). The input SHALL accept "a-b" with optional whitespace around the numbers and an en-dash in place of the hyphen. A valid entry SHALL be applied only on Enter, setting the offset to `a - 1` and the window size to `b - a + 1`. Escape SHALL cancel and restore the range. An entry is valid only when both parts are integers, `a` is at least 1, `b` is at least `a`, the window `b - a + 1` is at most 500 rows, and, when the total is known, `a` is not greater than the total. When the total is known and `b` exceeds it, the entry SHALL be accepted and the range displayed clamped to the total. Negative, reversed, zero, non-numeric and single-number entries SHALL be invalid. Enter on an invalid entry SHALL keep the input open, mark it `aria-invalid` and show "Enter a range like 1-40"; blur SHALL always cancel the edit and restore the range without applying it.

#### Scenario: Apply a range
- **WHEN** the user clicks the range, types "7-26" and presses Enter
- **THEN** rows 7 to 26 are requested and shown, and the window size becomes 20

#### Scenario: Tolerant parsing
- **WHEN** the user enters " 7 – 26 " with an en-dash and spaces
- **THEN** it is accepted as 7-26

#### Scenario: End beyond total
- **WHEN** 312 rows match and the user enters "301-400"
- **THEN** it is applied and displayed as "301-312 / 312"

#### Scenario: Start beyond total
- **WHEN** 312 rows match and the user enters "400-450"
- **THEN** the entry is invalid and the window does not change

#### Scenario: Invalid entries
- **WHEN** the user enters "40-1", "-5-10", "0-10", "abc", "7", or a window larger than 500 rows and presses Enter
- **THEN** the input stays open, is `aria-invalid`, shows "Enter a range like 1-40" and no request is made

#### Scenario: Escape cancels
- **WHEN** the user edits the input and presses Escape
- **THEN** the original range is shown and nothing is requested

#### Scenario: Blur cancels
- **WHEN** the input holds a valid or an invalid range and loses focus
- **THEN** nothing is requested and the original range is restored
