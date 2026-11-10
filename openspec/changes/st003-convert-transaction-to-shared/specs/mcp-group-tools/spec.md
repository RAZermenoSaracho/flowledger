# Spec Delta

## MODIFIED Requirements

### Requirement: Group tool set
The MCP server SHALL register for every credential: `list_groups`, `list_shared_expenses`, `search_users` and `list_blocked_users` (all `readOnlyHint: true`; an optional `id` returns that one record, with members for a group); and only for credentials holding `write`: `create_group`, `update_group`, `set_group_archived`, `remove_group_member`, `create_shared_expense`, `request_settlement`, `add_group_member`, `create_group_category`, `accept_shared_expense`, `reject_shared_expense`, `block_user`, `unblock_user`. No MCP tool SHALL approve or reject a settlement, settle a debt directly, delete a group or shared expense, update a shared expense, or request settlements in batch. Descriptions of tools that notify or change access for other users SHALL say so. `remove_group_member` SHALL carry `destructiveHint: true`.

#### Scenario: Read credential
- **WHEN** a read-only credential lists tools
- **THEN** the four read tools are present and none of the twelve write tools

#### Scenario: Forbidden operations absent
- **WHEN** a write credential lists tools
- **THEN** no tool for settlement approve or reject, direct settlement, group delete, shared-expense update/delete or batch settlement exists

### Requirement: Shared expense creation
`create_shared_expense` SHALL require a transaction owned by the user, SHALL accept any existing app user who is not blocked plus manual participants on group and non-group transactions, SHALL reject participants that include the owner, and SHALL reject shares that exceed the transaction amount. App-user participants SHALL be created `proposed`.

#### Scenario: Non-group transaction
- **WHEN** the transaction has no group and participants are valid
- **THEN** it is created and the participants are notified

#### Scenario: Non-member participant
- **WHEN** a participant user id is not a member of the transaction's group
- **THEN** it is created as a proposal

#### Scenario: Blocked participant
- **WHEN** a participant has blocked the owner
- **THEN** the call fails with "This user can't be invited." and nothing is created

#### Scenario: Foreign transaction
- **WHEN** the transaction belongs to another user
- **THEN** the result is not found

#### Scenario: Valid creation
- **WHEN** an owner creates a shared expense with valid participants
- **THEN** it is created and the participants are notified

### Requirement: User search tool
`search_users` SHALL match username only (exact first, then prefix) and return only `id`, `username` and `displayName` of other users, at least 3 characters, at most 10 results, never the caller and never users blocked in either direction.

#### Scenario: Short query or large limit
- **WHEN** `q` has fewer than 3 characters or `limit` exceeds 10
- **THEN** the call fails with a validation error

#### Scenario: Parity
- **WHEN** the same query is run through `GET /v1/users/search`
- **THEN** the data is identical

#### Scenario: No email exposure
- **WHEN** any result is returned
- **THEN** it contains no email or phone

### Requirement: Member add and group category tools
`add_group_member` (by `userId`) and `create_group_category` SHALL act as the credential's user, SHALL work only for the group's admin and an active group, and their descriptions SHALL state that they affect other users. `add_group_member` SHALL return the added user's public identity only. A non-admin or non-member SHALL get a not-found result, and a read credential SHALL be refused.

#### Scenario: Non-admin
- **WHEN** a member who is not an admin or a stranger calls either tool
- **THEN** the result is an error and no member, notification or category is created

#### Scenario: Admin adds and creates
- **WHEN** an admin adds a user and creates a category
- **THEN** the user is a `member`, is notified, no email is returned, and every member has access to the category

#### Scenario: Read key
- **WHEN** a read-only credential calls either tool
- **THEN** it is refused and nothing changes

## ADDED Requirements

### Requirement: Consent and blocking tools

MCP SHALL register `accept_shared_expense` and `reject_shared_expense` (id), `block_user` and `unblock_user` (userId) only for credentials holding `write`, and `list_blocked_users` for every credential, each using the same service, validation and errors as the web, acting only as the credential's user and emitting one `mcp.<tool>` audit line per write. Descriptions SHALL state that they affect other users.

#### Scenario: Accept
- **WHEN** a participant's write credential calls `accept_shared_expense` on a proposed share
- **THEN** the share is `accepted` and the owner is notified

#### Scenario: Not the participant
- **WHEN** another user's credential calls it
- **THEN** the result is a not-found error

#### Scenario: Read credential
- **WHEN** a read-only credential lists tools or calls a write tool
- **THEN** the write tools are absent or refused and nothing changes
