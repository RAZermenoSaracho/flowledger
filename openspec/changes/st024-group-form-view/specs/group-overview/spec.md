# Spec Delta

## ADDED Requirements

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

Clicking a Group card SHALL navigate to `/groups/:id`, the Group detail view. The overview SHALL NOT be shown beside the detail view. The detail view SHALL provide a clear control that returns to the overview, and the browser back button SHALL return to the overview too.

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

#### Scenario: Editing with the shared lifecycle
- **WHEN** a Group admin changes the name and saves
- **THEN** the change is saved through the shared Save/Cancel lifecycle and the updated name is shown

#### Scenario: Empty name
- **WHEN** a Group admin clears the name
- **THEN** a validation error is shown next to the field and Save is blocked

#### Scenario: Immediate actions do not dirty the draft
- **WHEN** a member is added, a category is changed, or the Group is archived or restored while the name is unedited
- **THEN** the form is not dirty and shows the refreshed data

#### Scenario: Draft survives a refetch
- **WHEN** a Group admin has an unsaved name change and adds a member
- **THEN** the unsaved name change is kept

#### Scenario: Leaving after delete or archive
- **WHEN** the user deletes the Group, or archives it
- **THEN** the overview is shown

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
