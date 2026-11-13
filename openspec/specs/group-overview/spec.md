# group-overview Specification

## Purpose
Group card overview and linkable Group detail view on the shared Form View, with members, category cards and paginated transactions.

## Requirements

### Requirement: Groups are browsed as responsive cards

`/groups` SHALL show the user's Groups as responsive cards, usable from mobile to desktop width. Each card SHALL show the name, description, member count, category count, the user's role, and an Archived badge when archived, using the existing Group list data only. Archived Groups SHALL be hidden by a visible, removable default filter.

#### Scenario: Cards at mobile and desktop width
- **WHEN** the user opens `/groups` at 375px and at 1440px width
- **THEN** Groups appear as cards that fit the width without horizontal scrolling

#### Scenario: Archived Groups hidden by default
- **WHEN** the user has an archived Group and opens `/groups`
- **THEN** the archived Group is not shown and a removable archived filter chip is visible

#### Scenario: Showing archived Groups
- **WHEN** the user removes the archived filter chip
- **THEN** archived Groups appear with an Archived badge

### Requirement: A Group opens in its own linkable view

Clicking a Group card SHALL navigate to `/groups/:id`, the Group detail view. The overview SHALL NOT be shown beside the detail view. The detail view SHALL provide a "Back to groups" link, guarded by the unsaved-changes confirm while the draft is dirty, that returns to the overview, and the browser back button SHALL return to the overview too.

#### Scenario: Open a Group
- **WHEN** the user clicks a Group card
- **THEN** the URL becomes `/groups/:id`, the Group's detail is shown, and the card list is not shown

#### Scenario: Return to the overview
- **WHEN** the user activates the back control or the browser back button on the detail view
- **THEN** the overview is shown in one step

#### Scenario: Linkable URL
- **WHEN** a member loads `/groups/:id` directly
- **THEN** that Group's detail view is shown

### Requirement: Group detail uses the shared Form View

The Group detail view SHALL be composed from the shared Form View introduced by `st005-reusable-editable-form-view` (`useFormDraft`, `FormView`, `EditableField`) with draft fields `name` and `description`, and SHALL NOT contain a Group-specific copy of the form lifecycle. Name SHALL be required.

#### Scenario: Direct editing without an Edit button
- **WHEN** a Group admin opens a non-archived Group
- **THEN** name and description are live controls with no Edit button or edit mode

#### Scenario: Compact controls at desktop width
- **WHEN** the detail view is shown at desktop width
- **THEN** icon Save/Cancel sit top-right in the header and appear only while the draft is dirty

#### Scenario: Compact controls at mobile width
- **WHEN** the detail view is shown at 375px width
- **THEN** the header wraps without overflow, with no sticky bottom bar and no horizontal scrolling

#### Scenario: Editing with the shared lifecycle
- **WHEN** a Group admin changes the name and saves
- **THEN** the change is saved through the shared Save/Cancel lifecycle and the updated name is shown

#### Scenario: Empty name
- **WHEN** a Group admin clears the name
- **THEN** a validation error is shown next to the field and Save is blocked

#### Scenario: Management actions in the record menu
- **WHEN** a Group admin opens the "Record actions" menu
- **THEN** Archive (or Restore) and Delete are offered there, Delete keeps its confirmation, and a non-admin member sees no menu

#### Scenario: Immediate actions do not dirty the draft
- **WHEN** a member is added or removed in the members `RelatedList`, a category is changed in the categories `RelatedList` (both immediate mode), or the Group is archived or restored, while the name is unedited
- **THEN** the form is not dirty and shows the refreshed data

#### Scenario: Draft survives a refetch
- **WHEN** a Group admin has an unsaved name change and adds a member
- **THEN** the unsaved name change is kept

#### Scenario: Immediate related lists keep a dirty draft
- **WHEN** a Group admin has an unsaved description change and edits a category row
- **THEN** the category change is saved on its own and the description edit is kept

#### Scenario: Leaving after delete or archive
- **WHEN** the user deletes the Group, or archives it
- **THEN** the overview is shown

### Requirement: Group detail is organized in tabs

The Group detail view SHALL pass `tabs` to the shared Form View: "General" (name, description and group summary), "Members", "Categories" and "Transactions". The active tab SHALL be driven by the `?tab=` URL parameter and default to General. The draft SHALL survive tab switches, and read-only/permission rules SHALL be identical in every tab.

#### Scenario: Tabs shown
- **WHEN** a member opens `/groups/:id`
- **THEN** the General, Members, Categories and Transactions tabs are shown and General is active

#### Scenario: Members tab
- **WHEN** the user opens the Members tab
- **THEN** the members list and member search/add are shown, and the General fields are not

#### Scenario: Unsaved name survives tab switch
- **WHEN** an admin edits the name, opens Members, and returns to General
- **THEN** the unsaved name is still in the field

#### Scenario: Non-admin in Members
- **WHEN** a non-admin member opens the Members tab
- **THEN** no member search/add or removal controls are shown

### Requirement: Group transactions are server-paginated

The Transactions tab SHALL list the caller's own transactions assigned to the Group through the existing `GET /transactions` endpoint filtered by `groupId`. It SHALL use the same related-transactions list as the account view: the shared search bar with name search and the transaction sort options (date by default, newest first, with an `id` tie-breaker), and the shared pagination control at 20 rows per page. It SHALL have loading, empty and error states, and each row SHALL link to the transaction and show date, account, category and amount. Other members' transactions and transactions of other Groups SHALL never be listed. The server's ownership scope SHALL apply before paging.

#### Scenario: Group filter and paging
- **WHEN** a member with 25 transactions in the Group opens Transactions and presses Next
- **THEN** page 2 of the `groupId`-filtered list is requested and shows the remaining 5, and the control reads "Page 2 of 2"

#### Scenario: Search resets the page
- **WHEN** the user on page 2 searches by name
- **THEN** page 1 of the matching Group transactions is requested

#### Scenario: Only the caller's Group transactions
- **WHEN** another member also has transactions in the Group, and the caller has transactions in another Group
- **THEN** neither appears in the caller's list or total

#### Scenario: Empty
- **WHEN** the caller has no transactions in the Group
- **THEN** an empty message is shown instead of rows

### Requirement: Members and categories are immediate RelatedLists

The members section SHALL be an ST-005 `RelatedList` in immediate mode: each add or remove is saved on its own and never becomes part of the draft. It SHALL stack as label/value rows below `sm`. Members SHALL be shown by public identity (`@username`, or `Name (@username)` when the user shares their name) and SHALL NOT show or fall back to an email. Member-add SHALL search by username. Public identity serialization and username search are provided by `st003-convert-transaction-to-shared`, which lands before this change; ST-024 adds no server work for them.

#### Scenario: Member shown by public identity
- **WHEN** the members list is shown
- **THEN** each member appears as `@username` or `Name (@username)` and no email is visible

#### Scenario: Add member by username
- **WHEN** a Group admin types at least 3 characters of a username in member-add
- **THEN** matching users are offered by username and selecting one adds them immediately

#### Scenario: Related lists at mobile width
- **WHEN** the detail view is shown at 375px width
- **THEN** members render as stacked rows and categories as a single column of cards, without horizontal scrolling

### Requirement: Group categories use the shared category cards

The Categories tab SHALL render Group categories with the same category card and form as the global Categories page: color indicator, name, type, an Archived badge, and a compact options menu with Edit, Archive or Restore, and Delete for Group admins of an active Group. Non-admins and archived Groups SHALL see the cards without the menu. Edit SHALL turn that card into its editor in place, leave the other cards unchanged, and allow only one card in edit at a time. Save and Cancel act only on that card. A compact "+" button in the tab header (admins, active Group) SHALL open a modal with the shared category form. The new category SHALL be created in the current Group without choosing it. The modal SHALL close on success and refresh the list, and SHALL stay open showing the error on failure. Cancel and Escape SHALL close the modal, asking "Discard unsaved changes?" first when a field was changed. Edits remain immediate and never touch the Group draft, and server authorization is unchanged.

#### Scenario: Edit in place
- **WHEN** an admin chooses Edit on the second of three category cards
- **THEN** the second card becomes the editor in its position and the first and third cards are unchanged

#### Scenario: Create through the modal
- **WHEN** an admin presses "+", enters a name and saves
- **THEN** the category is created in this Group, the modal closes and the new card appears

#### Scenario: Create error keeps the modal
- **WHEN** creation fails (for example, a duplicate name)
- **THEN** the modal stays open with the error and the entered values

#### Scenario: Member without admin role
- **WHEN** a non-admin member opens the Categories tab
- **THEN** cards are shown without an options menu or "+" button

### Requirement: Group data is not exposed to non-member participants

This change SHALL NOT widen access to Group data. A user who participates in a shared expense on a Group's transaction without being a Group member SHALL NOT be able to open the Group detail view or see its members, categories, summary or transactions.

#### Scenario: Non-member shared-expense participant
- **WHEN** a non-member participant of a shared expense opens `/groups/:id` for that Group
- **THEN** the not-found state is shown and no Group data is displayed

### Requirement: Access and editing follow Group roles

Only Group members SHALL be able to open a Group. A non-member, or an unknown or malformed id, SHALL see a not-found state with a link to the overview. Only Group admins SHALL be able to edit fields of a non-archived Group, and other members SHALL see them read-only. Server authorization is unchanged.

#### Scenario: Non-member
- **WHEN** a user who is not a member opens `/groups/:id`
- **THEN** a not-found state is shown and no Group data is displayed

#### Scenario: Member without the admin role
- **WHEN** a member with a non-admin role opens the Group
- **THEN** name and description are read-only and no management actions are offered

#### Scenario: Admin of an archived Group
- **WHEN** a Group admin opens an archived Group
- **THEN** name and description are read-only and restore remains available

### Requirement: Group behavior is preserved

Creating a Group, editing, archiving, restoring, deleting, adding members, managing categories, roles, the summary and the transactions list SHALL keep their existing behavior. Creating a Group SHALL happen on the overview and then open the new Group's detail view.

#### Scenario: Create a Group
- **WHEN** the user creates a Group from the overview
- **THEN** the Group is created and its detail view opens

#### Scenario: Member and category management
- **WHEN** a Group admin adds a member and creates, edits and archives a category
- **THEN** each action works as before and updates the detail view

#### Scenario: Summary and transactions
- **WHEN** a member opens a Group that has transactions
- **THEN** the summary and the recent transactions are shown as before

### Requirement: Legacy Group links keep working

`/groups?groupId=X` SHALL redirect, replacing the history entry, to `/groups/X`. Notification targets SHALL link to `/groups/X`.

#### Scenario: Old link
- **WHEN** a user opens `/groups?groupId=X`
- **THEN** the detail view of Group X is shown at `/groups/X` and browser back does not return to the old URL

#### Scenario: Group notification
- **WHEN** the user opens a notification that references a Group
- **THEN** the Group's detail view opens

### Requirement: Overlays render above page content

Filter modals and dropdowns on the overview and detail views SHALL appear above all page content and SHALL NOT be clipped or overlapped by other fields, in a single-column layout with no sticky list column. This closes KNOWN_ISSUES #028.

#### Scenario: Filter modal on the overview
- **WHEN** the user opens the filter modal on the overview at mobile and desktop width
- **THEN** it appears fully above all page content with no field overlapping it

#### Scenario: Dropdowns on the detail view
- **WHEN** the user opens a dropdown or action menu on the detail view
- **THEN** it appears fully above the neighboring sections and is not clipped

### Requirement: Group summary valuation in the preferred currency
The group summary SHALL NOT add amounts across currencies. It SHALL convert each currency to the viewer's preferred currency at the current rate, label the total as a valuation, and format it in that currency.

#### Scenario: Mixed currencies
- **WHEN** a group has balances in MXN and BTC and the viewer prefers USD
- **THEN** each is converted to USD separately, the total is labeled a valuation, and no raw MXN and BTC figures are added
