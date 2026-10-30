## ADDED Requirements

### Requirement: Group, shared-expense and settlement routes
In addition to the routes already allowlisted, `/v1` SHALL expose: GET `/v1/groups`, GET `/v1/groups/:id`, GET `/v1/shared-expenses`, GET `/v1/shared-expenses/:id`, GET `/v1/users/search` (`read`); POST `/v1/groups`, PUT `/v1/groups/:id`, POST `/v1/groups/:id/archive`, POST `/v1/groups/:id/restore`, POST `/v1/groups/:id/members`, POST `/v1/groups/:id/categories`, DELETE `/v1/groups/:id/members/:userId`, POST `/v1/shared-expenses`, POST `/v1/debts/:id/settlement-request`, POST `/v1/settlements/:id/approve`, POST `/v1/settlements/:id/reject` (`write`). Each SHALL reuse the internal controller, validator and service. The following SHALL remain unrouted (404): DELETE `/v1/groups/:id`, PUT and DELETE `/v1/shared-expenses/:id`, POST `/v1/debts/:id/settle`, and the batch settlement and batch approval routes.

#### Scenario: Excluded operations
- **WHEN** a write key calls `DELETE /v1/groups/:id`, `PUT /v1/shared-expenses/:id`, or `POST /v1/debts/:id/settle`
- **THEN** the response is 404 and nothing changes

#### Scenario: Read key refused
- **WHEN** a read-only key calls any of the eleven write routes
- **THEN** the response is 403, nothing changes, and the call is audited

### Requirement: Group authorization
Group reads SHALL require membership and group updates, archive and restore SHALL require group admin, as enforced by the existing services. Other users SHALL receive 404.

#### Scenario: Non-member
- **WHEN** a user who is not a member requests `GET /v1/groups/:id`
- **THEN** the response is 404

#### Scenario: Non-admin
- **WHEN** a member who is not an admin calls PUT, archive or restore
- **THEN** the response is 404 and the group is unchanged

#### Scenario: Archive and restore
- **WHEN** an admin archives then restores a group
- **THEN** each returns 200 and a repeat call leaves the same final state

### Requirement: Member removal
`DELETE /v1/groups/:id/members/:userId` SHALL allow a member to remove themself and a group admin to remove any member, returning 204; any other caller SHALL receive 404. It SHALL revoke the removed user's group-category access.

#### Scenario: Self-leave
- **WHEN** a member deletes their own membership
- **THEN** the response is 204 and they no longer see the group

#### Scenario: Admin removes member
- **WHEN** an admin removes another member
- **THEN** the response is 204

#### Scenario: Non-admin removes another
- **WHEN** a non-admin member removes another member
- **THEN** the response is 404 and the membership remains

### Requirement: Shared expense creation
`POST /v1/shared-expenses` SHALL validate the body with `sharedExpenseSchema`, SHALL require the referenced transaction to be owned by the caller and to belong to a group (otherwise 400, or 404 for a foreign or missing transaction), and SHALL otherwise apply the existing participant rules (group members only, owner excluded, shares equal the transaction amount).

#### Scenario: Non-group transaction
- **WHEN** the transaction has no group
- **THEN** the response is 400 and nothing is created or notified

#### Scenario: Non-member participant
- **WHEN** a participant is not a member of the transaction's group
- **THEN** the response is 400 and nothing is created

#### Scenario: Foreign transaction
- **WHEN** the transaction belongs to another user
- **THEN** the response is 404

#### Scenario: Valid
- **WHEN** an owner posts a valid shared expense for a group transaction
- **THEN** the response is 201 and participants are notified

### Requirement: Settlement requests and decisions
`POST /v1/debts/:id/settlement-request` SHALL succeed only for the debtor, for an outstanding amount, with no existing pending request. `POST /v1/settlements/:id/approve` and `/reject` SHALL succeed only for the creditor while the request is pending; approve SHALL create the debtor expense and creditor income transactions and update participant paid state in one database transaction; reject SHALL only change the status. A non-party or already-decided request SHALL return 404.

#### Scenario: Debtor requests
- **WHEN** the debtor posts a valid request
- **THEN** the response is 201 and the creditor is notified

#### Scenario: Wrong party requests
- **WHEN** the creditor or an unrelated user posts the request
- **THEN** the response is 404 and no request exists

#### Scenario: Creditor approves
- **WHEN** the creditor approves a pending request with their account and category
- **THEN** two transactions (debtor expense, creditor income) exist, the participant paid amount is updated and the request is approved

#### Scenario: Debtor approves
- **WHEN** the debtor calls approve on their own request
- **THEN** the response is 404 and the request is still pending

#### Scenario: Reject
- **WHEN** the creditor rejects a pending request
- **THEN** the request is rejected and no transactions are created

#### Scenario: Already decided
- **WHEN** approve or reject is called on a non-pending request
- **THEN** the response is 404

### Requirement: Bounded shared-expense list
`GET /v1/shared-expenses` SHALL return at most 100 rows with `total`, and only shared expenses where the caller is owner or participant.

#### Scenario: Oversized list
- **WHEN** the caller is involved in 250 shared expenses
- **THEN** 100 are returned with `total` 250

#### Scenario: Unrelated expense
- **WHEN** a shared expense involves only other users
- **THEN** it does not appear and `GET /v1/shared-expenses/:id` returns 404

### Requirement: User search
`GET /v1/users/search` (`read`) SHALL return other users matching a name or email substring as `{ id, name, email }` only, excluding the caller, for a query of at least 3 characters and at most 10 results. A shorter query or a limit above 10 SHALL be rejected with 400.

#### Scenario: Short query
- **WHEN** `q` has fewer than 3 characters
- **THEN** the response is 400

#### Scenario: Result cap
- **WHEN** more than 10 users match
- **THEN** at most 10 are returned and the caller is never among them

### Requirement: Group member add
`POST /v1/groups/:id/members` SHALL add the user named by `userId` as a `member`, only for a group admin and an active group; the target is notified and gains access to the group's categories. A non-admin member or non-member SHALL receive 404, a read key 403, an existing member 409, an unknown user or self or archived group 400.

#### Scenario: Admin adds
- **WHEN** an admin posts a valid `userId`
- **THEN** the response is 201, the user is a member and a notification exists

#### Scenario: Non-admin
- **WHEN** a non-admin member or a stranger posts
- **THEN** the response is 404 and nothing changes

#### Scenario: Read key
- **WHEN** a read-only key posts
- **THEN** the response is 403 and nothing changes

### Requirement: Group category create
`POST /v1/groups/:id/categories` SHALL create a category for the group, only for a group admin and an active group, granting every current member access. A non-admin or non-member SHALL receive 404 and a read key 403.

#### Scenario: Admin creates
- **WHEN** an admin posts a valid category
- **THEN** the response is 201 and each member has access to it

#### Scenario: Non-admin or read key
- **WHEN** a non-admin, a stranger or a read-only key posts
- **THEN** the response is 404 (or 403 for the key) and no category is created
