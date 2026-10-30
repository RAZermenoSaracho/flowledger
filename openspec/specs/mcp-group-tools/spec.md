# mcp-group-tools Specification

## Purpose
Expose the authenticated user's group operations (groups, members, group categories, shared expenses and settlement requests) as MCP tools that reuse the existing group services, enforce read/write scopes and group membership rules, and flag cross-user and destructive effects.

## Requirements

### Requirement: Group tool set
The MCP server SHALL register for every credential: `list_groups`, `list_shared_expenses` and `search_users` (all `readOnlyHint: true`; an optional `id` returns that one record, with members for a group); and only for credentials holding `write`: `create_group`, `update_group`, `set_group_archived`, `remove_group_member`, `create_shared_expense`, `request_settlement`, `add_group_member`, `create_group_category`. No MCP tool SHALL approve or reject a settlement, settle a debt directly, delete a group or shared expense, update a shared expense, or request settlements in batch. Descriptions of tools that notify or change access for other users SHALL say so. `remove_group_member` SHALL carry `destructiveHint: true`.

#### Scenario: Read credential
- **WHEN** a read-only credential lists tools
- **THEN** the three read tools are present and none of the eight write tools

#### Scenario: Forbidden operations absent
- **WHEN** a write credential lists tools
- **THEN** no tool for approve, reject, direct settlement, group delete, shared-expense update/delete or batch settlement exists

### Requirement: Read credentials cannot mutate
A mutating group tool called with a credential lacking `write` SHALL be refused and change nothing.

#### Scenario: Read key calls request_settlement
- **WHEN** a read-only credential calls `request_settlement`
- **THEN** it is refused and no settlement request or notification is created

### Requirement: Group authorization comes from the services
Group tools SHALL act only as the credential's user. A non-member SHALL be unable to read a group, and a non-admin SHALL be unable to update, archive or restore it, each with a not-found result indistinguishable from a missing id.

#### Scenario: Non-member read
- **WHEN** a credential's user is not a member of the group
- **THEN** `list_groups` with that `id` returns not found

#### Scenario: Non-admin update
- **WHEN** a member who is not an admin calls `update_group` or `set_group_archived`
- **THEN** the result is not found and the group is unchanged

#### Scenario: Admin archive
- **WHEN** an admin archives then restores a group
- **THEN** both succeed and the group is active again

### Requirement: Member removal
`remove_group_member` SHALL allow a member to remove themself and an admin to remove any member, and SHALL refuse everyone else.

#### Scenario: Self-leave
- **WHEN** a member calls `remove_group_member` for their own user id
- **THEN** their membership is removed and their access to group categories is revoked

#### Scenario: Non-admin removes another
- **WHEN** a non-admin member removes another member
- **THEN** the result is not found and the membership remains

### Requirement: Shared expense creation
`create_shared_expense` SHALL require a transaction owned by the user that belongs to a group, SHALL reject participants who are not members of that group or who include the owner, and SHALL reject shares that do not sum to the transaction amount.

#### Scenario: Non-group transaction
- **WHEN** the transaction has no group
- **THEN** the call fails with a validation error and no shared expense or notification is created

#### Scenario: Non-member participant
- **WHEN** a participant user id is not a member of the transaction's group
- **THEN** the call fails and nothing is created

#### Scenario: Foreign transaction
- **WHEN** the transaction belongs to another user
- **THEN** the result is not found

#### Scenario: Valid creation
- **WHEN** an owner creates a shared expense on a group transaction with group-member participants
- **THEN** it is created and the participants are notified

### Requirement: Settlement requests
`request_settlement` SHALL be callable only by the debtor of the debt, for an outstanding amount, with at most one pending request per debt.

#### Scenario: Creditor or stranger calls
- **WHEN** a user who is not the debtor requests a settlement
- **THEN** the result is not found and no request is created

#### Scenario: Duplicate pending
- **WHEN** a pending request already exists for the debt
- **THEN** the call fails and no second request is created

### Requirement: Reads are participant-scoped and bounded
`list_shared_expenses` SHALL return only shared expenses where the user is owner or participant. `list_shared_expenses` SHALL return at most 100 rows with total.

#### Scenario: Unrelated shared expense
- **WHEN** a shared expense involves only other users
- **THEN** it is not listed and `list_shared_expenses` with that `id` returns not found

### Requirement: Write audit
Each group write tool call, successful or failed, SHALL emit exactly one audit line with user id, credential kind and id, operation, resource id when known and status, and no request body.

#### Scenario: Refused call audited
- **WHEN** a non-admin calls `update_group`
- **THEN** one audit line records status 404 and the group id

### Requirement: User search tool
`search_users` SHALL return only `id`, `name` and `email` of other users matching a substring of at least 3 characters, at most 10 results, never the caller.

#### Scenario: Short query or large limit
- **WHEN** `q` has fewer than 3 characters or `limit` exceeds 10
- **THEN** the call fails with a validation error

#### Scenario: Parity
- **WHEN** the same query is run through `GET /v1/users/search`
- **THEN** the data is identical

### Requirement: Member add and group category tools
`add_group_member` (by `userId`) and `create_group_category` SHALL act as the credential's user, SHALL work only for the group's admin and an active group, and their descriptions SHALL state that they affect other users. A non-admin or non-member SHALL get a not-found result, and a read credential SHALL be refused.

#### Scenario: Non-admin
- **WHEN** a member who is not an admin or a stranger calls either tool
- **THEN** the result is an error and no member, notification or category is created

#### Scenario: Admin adds and creates
- **WHEN** an admin adds a user and creates a category
- **THEN** the user is a `member`, is notified, and every member has access to the category

#### Scenario: Read key
- **WHEN** a read-only credential calls either tool
- **THEN** it is refused and nothing changes
