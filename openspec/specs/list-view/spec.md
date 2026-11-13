# list-view Specification

## Purpose
A shared, model-agnostic list shell for the web app: header, toolbar, grouped or flat records, loading/error/empty states, record counts, optional editable-range pagination and row selection with bulk actions, while each feature module keeps its own record rendering and business logic.

## Requirements

### Requirement: Shared list shell
Web list pages SHALL be built on one shared list view that renders a header with the title, an optional subtitle, the record count, optional actions and an optional pager, a toolbar area below the header (where the module places its search bar), and the list body, all inside one card. On desktop the pager SHALL sit at the right of the header row; on narrow screens the header SHALL wrap so the pager takes its own full-width row below the title and actions. The shell SHALL NOT fetch data or depend on any model.

#### Scenario: Desktop header
- **WHEN** a list with actions and a pager is shown on a wide screen
- **THEN** the title, subtitle and count are at the left of one row and the actions and pager are at its right, with the toolbar below

#### Scenario: Narrow header
- **WHEN** the same list is shown at 320px
- **THEN** the title and actions share a row, the pager has its own full-width row below with tap targets of at least 44px, and the toolbar is below that

#### Scenario: No toolbar or actions
- **WHEN** a list provides neither actions nor a toolbar
- **THEN** only the title, count and body are rendered with no empty gaps

### Requirement: Model-agnostic composition
The list view SHALL render its rows through a caller-supplied card renderer, and SHALL accept either a flat list of rows or rows split into labelled groups (not both). Grouped lists SHALL show a heading per group and omit groups with no rows. Rows SHALL be keyed by a caller-supplied stable key. Card lists SHALL support a single-column stack and a responsive two-column grid.

#### Scenario: Card renderer
- **WHEN** a list is given items and a card renderer
- **THEN** each item is rendered by that renderer in the order given

#### Scenario: Grouped sections
- **WHEN** a list is given groups of items
- **THEN** each non-empty group shows its label above its rows and empty groups are not shown

### Requirement: Loading, error and empty states
The list view SHALL show a loading indicator when loading with no rows, SHALL keep existing rows visible (not replace them with the indicator) while a refetch is in progress, SHALL show an error message with `role="alert"` when an error is provided, and SHALL show the caller's empty text through the shared empty state when there are no rows and no error. The error SHALL NOT hide the header or toolbar.

#### Scenario: First load
- **WHEN** a list is loading and has no rows yet
- **THEN** a loading indicator is shown instead of the empty text

#### Scenario: Refetch keeps rows
- **WHEN** a list with rows refetches
- **THEN** the rows stay visible and no loading placeholder replaces them

#### Scenario: Error
- **WHEN** loading the list failed
- **THEN** an alert with the error message is shown and the header and toolbar remain

#### Scenario: Empty
- **WHEN** a loaded list has no rows
- **THEN** the empty text is shown

### Requirement: Record count display
The list view SHALL show a record count in the header. When a pager is present the pager's range carries the count. Without a pager, a list given a total larger than the rows shown SHALL read "{shown} of {total}", and otherwise "{n} records" (singular "1 record").

#### Scenario: Filtered subset
- **WHEN** 3 of 12 records are shown and the list has no pager
- **THEN** the header shows "3 of 12"

#### Scenario: All shown
- **WHEN** 5 records are shown and the total is 5
- **THEN** the header shows "5 records"

### Requirement: Optional pagination
Pagination SHALL be optional per list. A list given no pager SHALL render no pagination control. A list given a pager SHALL render the shared editable-range pagination control in its header. Server-paginated lists and a client-side list SHALL drive the control through the same state: the window offset and limit, the total (or unknown), whether more rows exist, whether a fetch is in progress, and a change callback.

#### Scenario: Unpaginated list
- **WHEN** Accounts is shown
- **THEN** no pagination control is rendered

#### Scenario: Paginated list
- **WHEN** Transactions is shown
- **THEN** the pagination control is in the list header

### Requirement: Selection and bulk actions
A list MAY enable row selection. When enabled, each row SHALL have a labelled checkbox, and a selection bar SHALL show the number selected, "Select page" (the visible window), "Clear", and the module's bulk action buttons. Selecting rows by id SHALL survive a refetch of the same query. Changing the search, filters or sort SHALL clear the selection. Moving to a different window SHALL clear selected ids but keep a "select all matching" choice. When the list has more matching rows than the current window and the module supports it, selecting the whole window SHALL offer "Select all {total} matching", which selects every matching row (not only the loaded ones) and which a later manual toggle or a query change SHALL undo. Bulk actions SHALL receive a request that distinguishes "these ids" from "all matching".

#### Scenario: Select page
- **WHEN** the user presses "Select page" on a window of 50 rows
- **THEN** those 50 rows are selected and the bar shows "50 selected"

#### Scenario: Select all matching
- **WHEN** 120 rows match, the user selected a window of 50 and presses "Select all 120 matching"
- **THEN** the bar shows 120 selected and the bulk request means all matching rows

#### Scenario: Toggle after select all
- **WHEN** all matching rows are selected and the user unticks one row
- **THEN** the selection falls back to the ids of the visible window minus that row

#### Scenario: Query change clears
- **WHEN** rows are selected and the user changes the search
- **THEN** the selection is cleared

#### Scenario: Window change
- **WHEN** ids are selected and the user moves to the next window
- **THEN** the ids are cleared, while an active "select all matching" choice remains

#### Scenario: Selection hidden when unused
- **WHEN** a list does not enable selection
- **THEN** no checkboxes or selection bar are rendered

### Requirement: Shared list files are model-agnostic
The shared list files (`ListView`, `Pagination`, `EmptyState`, `usePagination`, `useListSelection`) SHALL NOT import from any `pages/` module.

#### Scenario: No page imports
- **WHEN** the shared list files are searched for imports
- **THEN** none resolves into `pages/`

### Requirement: Responsive layout
The list view, its header and selection bar SHALL fit a 320px-wide screen without horizontal page scrolling.

#### Scenario: 320px
- **WHEN** a list with a pager, toolbar, selection bar and rows is shown at 320px
- **THEN** the page does not scroll horizontally

### Requirement: List accessibility
The record range SHALL be announced politely to assistive technology when it changes. Errors SHALL use `role="alert"`. Selection checkboxes SHALL have accessible labels. The range control SHALL have an accessible name such as "Records 41 to 80 of 312, edit range", the previous and next controls SHALL be named "Previous records" and "Next records", and an invalid range entry SHALL be linked to its error message.

#### Scenario: Range announced
- **WHEN** the user moves to the next window
- **THEN** the new range text is in a polite live region

#### Scenario: Checkbox labels
- **WHEN** selection is enabled
- **THEN** every row checkbox and the select-page control has an accessible name

### Requirement: Window-size persistence
A paginated list MAY remember the user's window size (limit) per list in the browser. Only the limit SHALL be remembered; the offset SHALL always start at 0. A remembered limit SHALL be used on the next visit only if it is a positive integer within the allowed bounds (at most 500). Unavailable or failing browser storage SHALL NOT break the list; the list's default window (transactions 50, imported 50, related 20) is used.

#### Scenario: Remembered window size
- **WHEN** the user edits Transactions to 1-100 and returns later in the same browser
- **THEN** Transactions loads rows 1-100

#### Scenario: Offset not remembered
- **WHEN** the user was viewing 101-150 and returns later
- **THEN** the list starts at row 1 with the remembered window size

#### Scenario: Invalid stored limit
- **WHEN** the stored limit is 0, 9999 or not a number
- **THEN** the default window is used

#### Scenario: Storage unavailable
- **WHEN** browser storage throws
- **THEN** the list works with the default window
