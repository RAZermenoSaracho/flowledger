## Purpose

Server-side, bounded and stable pagination for FlowLedger's transaction list views, with one shared pagination control in the web app.

## ADDED Requirements

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
The web Transactions list SHALL request one page at a time (50 by default; 25, 50 or 100 selectable) with the current search, filters and sort, and SHALL show the server's total. Changing the search, filters, sort or page size SHALL return to page 1. Moving between pages SHALL keep the search, filters and sort. Group-by buckets SHALL apply to the rows of the current page.

#### Scenario: Next page keeps filters
- **WHEN** the user filters by an account and presses Next
- **THEN** page 2 of the same filtered, sorted result is requested and shown

#### Scenario: Filter change resets page
- **WHEN** the user is on page 3 and changes the search
- **THEN** page 1 of the new result is requested

#### Scenario: Total from the server
- **WHEN** 120 transactions match and the page size is 50
- **THEN** the list shows 120 results and "Page 1 of 3"

### Requirement: Imported Transactions list is server-paginated
The imported-transactions list endpoint SHALL accept optional pagination. With pagination it SHALL return only that page and `total` SHALL remain the full match count. Without pagination the response SHALL be unchanged. The web Imported Transactions tab SHALL request pages of 50. "Select all filtered" batch actions SHALL still apply to every matching row, not only the visible page.

#### Scenario: Paged imported list
- **WHEN** 70 imported transactions match and the web tab requests page 2 of 50
- **THEN** 20 rows are returned with `total` 70 and `pendingCount` unchanged

#### Scenario: Legacy callers unchanged
- **WHEN** `/v1/imported-transactions` or the MCP `list_imported_transactions` tool is called without pagination
- **THEN** the response has the same shape and totals as before

#### Scenario: Select all filtered spans pages
- **WHEN** the user selects all filtered pending rows on page 1 of 2 and imports them
- **THEN** every matching row on both pages is imported

### Requirement: Shared pagination control
Paginated web lists SHALL use one pagination control that shows Previous and Next, the current page and total pages (or just the page when the total is unknown), the result count when known, and an optional page-size selector. Controls SHALL be disabled while a page is loading or at either end. The previous page's rows SHALL stay visible while the next page loads. When the current page falls beyond the last page (for example after a deletion) the list SHALL move to the last page. The control SHALL fit a 320px-wide screen without horizontal scrolling.

#### Scenario: Last page after deletion
- **WHEN** the user deletes the only row on the last page
- **THEN** the list shows the new last page

#### Scenario: Mobile width
- **WHEN** a paginated list is shown at 320px
- **THEN** the pagination control fits without horizontal scrolling
