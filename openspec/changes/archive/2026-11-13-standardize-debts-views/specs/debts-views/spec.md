# Spec Delta

## Purpose
How the Debts tabs, the per-person balance detail and the Shared Expense record view present lists, open records and navigate back. They follow the same list and record-view conventions as Accounts and Transactions.

## ADDED Requirements

### Requirement: Debts tabs use the shared list states
Every list on the Debts tabs SHALL be rendered through the shared list view: Outstanding Balances, both Pending Settlement Requests lists, Settled History, Awaiting Acceptance and Shared Expenses. While debts are loading, each list SHALL show the shared loading state. When loading fails, each list SHALL show the shared error alert. The Debts page SHALL NOT render a separate page-level loading or error line.

#### Scenario: Debts are loading
- **WHEN** the Debts page is opened and the debts request has not resolved yet
- **THEN** the active tab's list shows the loading indicator, not its empty text

#### Scenario: Debts fail to load
- **WHEN** the debts request fails
- **THEN** the active tab's list shows an error with `role="alert"` and its header stays visible

### Requirement: Awaiting Acceptance list
The Awaiting Acceptance tab SHALL be a shared list view. Shares awaiting the viewer's response and shares the viewer rejected SHALL appear as separately labelled groups, and a group with no rows SHALL be hidden. Each row SHALL keep its Accept, Reject and Reject-and-block actions with unchanged behaviour. When the actions fit, they SHALL be shown on the right of the row, beside the share details. When they do not fit, as on mobile, they SHALL be available only through the row's three-dot actions menu, not as buttons below the content. Each row SHALL link its title to the Shared Expense record view. A share highlighted from a notification SHALL be scrolled into view and highlighted. If the highlighted share is no longer awaiting, the list SHALL say so.

#### Scenario: Awaiting and rejected shares
- **WHEN** the viewer has one share awaiting a response and one rejected share
- **THEN** the list shows an "Awaiting your response" group and a "Rejected" group, each with its row

#### Scenario: Mobile actions menu
- **WHEN** the viewer opens Awaiting Acceptance on a 375px-wide screen
- **THEN** each awaiting row shows a three-dot menu with Accept, Reject and Reject and block, and no action buttons below the row

#### Scenario: Accept from the list
- **WHEN** the viewer clicks Accept on an awaiting share
- **THEN** the share is accepted exactly as before and leaves the awaiting group

### Requirement: Person balance detail navigation
The per-person balance detail at `/debts/balances/:personKey` SHALL use the shared record-view header. The header SHALL show the person's display name as the title and an icon-only back arrow labelled "Back to balances" that navigates to `/debts?tab=balances`. The header SHALL be inside the same card as the balance content, as on other record views. The balance summary, the debt tables, the per-debt settlement request forms, row selection and batch settlement requests SHALL keep their existing appearance and behaviour.

#### Scenario: Header inside the card
- **WHEN** the viewer opens a balance detail on a desktop or mobile screen
- **THEN** the back arrow and the person's name are rendered inside the card that holds the balance summary and debt tables

#### Scenario: Back from a balance
- **WHEN** the viewer opens a balance from Outstanding Balances and activates the back arrow
- **THEN** the Debts page opens on the Outstanding Balances tab

#### Scenario: Settlement still works
- **WHEN** the viewer fills a debt's settlement form on the detail and submits it
- **THEN** a settlement request is created exactly as before

### Requirement: Shared Expense record view
Each shared expense SHALL have a record view at `/debts/shared-expenses/:id`, opened by activating its row in the Shared Expenses list. The view SHALL use the shared record-view header. Its title SHALL be the shared expense title. Its back arrow SHALL be labelled "Back to shared expenses" and navigate to `/debts?tab=sharedExpenses`. The view SHALL have two tabs:
- **General:** title, status, and a read-only summary of the transaction (name, amount, date) and of the debt direction.
- **Participants:** each share with its participant, kind (app user or manual), share, paid amount, status and response.

Only the owner SHALL be able to edit title and status. Edits SHALL be saved as one batch through the shared Save and Cancel controls and SHALL follow the existing shared-expense update rules. Participants SHALL see the same view read-only. A shared expense that does not exist, or that the viewer may not see, SHALL show a not-found state with a way back to the list.

#### Scenario: Owner edits the title
- **WHEN** the owner changes the title and saves
- **THEN** the shared expense is updated, the view stays open, and the list shows the new title

#### Scenario: Participant opens a shared expense
- **WHEN** a participant opens a shared expense they belong to
- **THEN** the view shows its fields and participants read-only, with no Save control

#### Scenario: Unknown shared expense
- **WHEN** the viewer opens `/debts/shared-expenses/<id>` for an id they cannot see
- **THEN** a not-found message with a link back to Shared Expenses is shown

### Requirement: Shared expense participants are managed on the transaction
The Shared Expense record view SHALL NOT duplicate participant editing. For the owner, its record actions SHALL include "Manage participants", which opens the Sharing tab of the underlying transaction's record view, and "Open transaction", which opens that transaction's record view. From there the back arrow SHALL return to the shared expense. Participants SHALL NOT see these actions.

#### Scenario: Owner manages participants
- **WHEN** the owner chooses "Manage participants"
- **THEN** `/transactions/<transactionId>?tab=sharing` opens, and its back arrow returns to the shared expense

### Requirement: Shared Expenses list opens records
The Shared Expenses list SHALL NOT render an edit form above or inside the list, and its rows SHALL NOT carry an Edit action. Activating a row SHALL open its Shared Expense record view. Rows SHALL be keyboard-focusable links. The list's add control SHALL open the new-transaction record view with sharing turned on and the Sharing tab selected. Search, filters, grouping, sorting and notification highlighting of a shared expense or participant SHALL keep working.

#### Scenario: Open from the list
- **WHEN** the viewer activates a shared expense row
- **THEN** `/debts/shared-expenses/<id>` opens and no form appears on the list page

#### Scenario: Add a shared expense
- **WHEN** the viewer activates "Add shared expense"
- **THEN** `/transactions/new` opens on the Sharing tab with sharing on, and saving creates the transaction and its shared expense together

### Requirement: Pending settlement requests in tabs
The Pending Settlement Requests tab SHALL show "Requests by me" and "Awaiting my approval" as two tabs. Only the selected tab's list SHALL be shown, and each tab SHALL show its request count. The selected tab SHALL be kept in the URL. A request highlighted from a notification SHALL open the tab that contains it. Otherwise "Requests by me" SHALL be selected. Each list SHALL keep its search, selection, batch approval, approval form and highlight behaviour. Approval drafts and selection SHALL survive switching tabs.

#### Scenario: Switch tabs
- **WHEN** the viewer is on "Requests by me" and selects "Awaiting my approval"
- **THEN** only the approvals list is shown, and the URL records the selection

#### Scenario: Highlighted approval
- **WHEN** a notification opens `/debts?tab=pending&settlementId=<id>` for a request awaiting the viewer's approval
- **THEN** the "Awaiting my approval" tab is selected and the request is highlighted
