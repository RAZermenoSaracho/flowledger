# public-rest-api Specification

## Purpose
Defines the key-authenticated `/v1` REST surface: an explicit allowlist of read and write operations on the owner's accounts, categories and transactions, with scope enforcement, bounded pagination and auditing of writes.

## Requirements

### Requirement: Explicit route allowlist
The system SHALL expose exactly these routes under `/v1`:
- Existing: GET `/v1/accounts`, GET `/v1/categories`, GET `/v1/transactions`, GET `/v1/transactions/summary`, GET `/v1/transactions/:id`, POST `/v1/transactions`, PUT `/v1/transactions/:id`.
- Reads: GET `/v1/debts`, GET `/v1/reports/summary`, GET `/v1/reports/by-category`, GET `/v1/reports/monthly-cashflow`, GET `/v1/currencies`, GET `/v1/currencies/rate`, GET `/v1/notifications`, GET `/v1/imported-transactions`, GET `/v1/notifications/unread-count`, GET `/v1/me`.
- Writes: POST `/v1/accounts`, PUT `/v1/accounts/:id`, POST `/v1/accounts/:id/archive`, POST `/v1/accounts/:id/restore`, POST `/v1/categories`, PUT `/v1/categories/:id`, POST `/v1/categories/:id/archive`, POST `/v1/categories/:id/restore`, DELETE `/v1/transactions/:id`, DELETE `/v1/accounts/:id`, DELETE `/v1/categories/:id`, PATCH `/v1/notifications/:id/read`, PATCH `/v1/notifications/read-all`, PATCH `/v1/me`, PATCH `/v1/imported-transactions/:id`, POST `/v1/imported-transactions/:id/{ignore,unignore,import}`, POST `/v1/imported-transactions/batch-{ignore,unignore,import}`.

Every other method/path under `/v1` SHALL return 404 with a JSON body `{ "message": ... }`.

#### Scenario: Listed route works
- **WHEN** a valid key with sufficient scope calls a listed route with valid input
- **THEN** the response has the same status and body shape as the equivalent internal route (200, 201 for creates, 204 for DELETE), except for the caps in "Bounded list responses"

#### Scenario: Unlisted route
- **WHEN** an authenticated client calls `GET /v1/nothing` or `DELETE /v1/imported-transactions/:id`
- **THEN** the response is 404 with a JSON message

#### Scenario: DELETE is not exposed
- **WHEN** an authenticated client calls `DELETE /v1/groups/:id` or `DELETE /v1/shared-expenses/:id`
- **THEN** the response is 404 and the record is unchanged

#### Scenario: Transaction delete is routable
- **WHEN** a write key calls `DELETE /v1/transactions/:id` for its own transaction
- **THEN** the response is 204 and the transaction no longer exists

### Requirement: Credential authentication
Every `/v1` request SHALL carry `Authorization: Bearer <api key>` for an active, unexpired API key whose user exists. Missing, malformed, revoked, expired or unknown credentials, and web-session JWTs, SHALL return 401. The user identity SHALL come only from the verified credential.

#### Scenario: Web JWT rejected
- **WHEN** a request to any `/v1` route carries a valid web-session JWT
- **THEN** the response is 401

#### Scenario: No credential
- **WHEN** a request to a listed or unlisted `/v1` path has no Authorization header
- **THEN** the response is 401

#### Scenario: Revoked or expired key
- **WHEN** a revoked or expired key is used
- **THEN** the response is 401

### Requirement: Scope enforcement
GET routes SHALL require the `read` scope; POST, PUT, PATCH and DELETE routes SHALL require `write`. A key with `write` SHALL also satisfy `read`. A missing scope SHALL return 403.

#### Scenario: Read key writes
- **WHEN** a read-only key calls any POST, PUT or DELETE route under `/v1`
- **THEN** the response is 403 and nothing is created, changed or deleted

#### Scenario: Write key reads
- **WHEN** a read+write key calls a GET route
- **THEN** the response is 200

#### Scenario: Scope checked before validation
- **WHEN** a read-only key sends an invalid body to POST
- **THEN** the response is 403, not 400

### Requirement: Ownership isolation
Every route SHALL act only on the credential owner's data using the same ownership rules as the internal API. A resource id belonging to another user SHALL be indistinguishable from a missing one.

#### Scenario: Cross-user read
- **WHEN** user A's key requests `GET /v1/transactions/:id` for user B's transaction
- **THEN** the response is 404

#### Scenario: Cross-user write
- **WHEN** user A's write key calls `PUT /v1/transactions/:id` for user B's transaction
- **THEN** the response is 404 and B's transaction is unchanged

#### Scenario: Lists are scoped
- **WHEN** user A lists transactions, accounts or categories
- **THEN** no record of user B appears

#### Scenario: Cross-user reference in a body
- **WHEN** user A creates a transaction referencing user B's `accountId`
- **THEN** the request is rejected exactly as the internal API rejects it and no transaction is created

### Requirement: Input validation and query format
Request bodies and query parameters SHALL be validated with the shared schemas used by the internal API. List and summary routes SHALL accept the same `query` parameter (a JSON-encoded datasieve expression) as the internal routes. Validation failures SHALL return 400 with the existing error shape.

#### Scenario: Invalid body
- **WHEN** a write key posts a transaction missing required fields
- **THEN** the response is 400 with `message: "Validation failed"` and `issues`

#### Scenario: Malformed query
- **WHEN** `query` is not valid JSON
- **THEN** the response is 400

### Requirement: Bounded transaction pagination
`GET /v1/transactions` SHALL return at most 100 rows per request. When the `query` omits pagination the system SHALL apply page 1 with page size 50. A requested page size above 100 SHALL be reduced to 100. A page size below 1 or non-offset pagination SHALL return 400. This policy SHALL NOT affect the internal `/transactions` routes.

#### Scenario: Default page size
- **WHEN** a client lists transactions without pagination and the user has more than 50
- **THEN** 50 rows are returned and `meta` reports total and page count

#### Scenario: Oversized page clamped
- **WHEN** the query asks for `pageSize` 500
- **THEN** at most 100 rows are returned and `meta.pageSize` is 100

#### Scenario: Internal route unchanged
- **WHEN** the web app lists transactions through `/transactions` with its own pagination or none
- **THEN** behaviour is identical to before this change

### Requirement: Error shape
Errors SHALL use the existing JSON shape `{ "message": string, ...details }` with status 400, 401, 403, 404, 429 or 500. Error bodies SHALL NOT contain credential material.

#### Scenario: Unauthorized body
- **WHEN** authentication fails
- **THEN** the body is JSON with a `message` and never echoes the presented token

### Requirement: Rate limiting
All `/v1` requests, including unauthenticated and unlisted-path requests, SHALL pass through the shared rate limiter and return 429 when exceeded.

#### Scenario: Limit exceeded
- **WHEN** a client exceeds the configured request budget
- **THEN** the response is 429

### Requirement: Write auditing
Each POST, PUT, PATCH and DELETE under `/v1`, whether it succeeds or fails after authentication and scope checks, SHALL emit exactly one audit log line with user id, credential kind and id, operation, resource id when known, and HTTP status. For creates the resource id SHALL be the id of the created transaction, account or category. The line SHALL NOT contain secrets or request bodies. A request rejected for missing scope SHALL also be audited with status 403.

#### Scenario: Successful create
- **WHEN** a write key creates a transaction, account or category
- **THEN** one audit line has `op` for create, the new resource id and status 201

#### Scenario: Failed update
- **WHEN** a write key updates another user's transaction
- **THEN** one audit line records status 404 and the requested id

#### Scenario: Delete audited
- **WHEN** a write key deletes a transaction, or a read key attempts it
- **THEN** one audit line records status 204, or 403 respectively, with the requested id

#### Scenario: Reads not audited
- **WHEN** a GET succeeds
- **THEN** no audit line is emitted

### Requirement: Account and category writes
`POST /v1/accounts` and `POST /v1/categories` SHALL validate the body with the shared account and category schemas and create the record for the credential's user. `PUT` SHALL accept a partial body validated by the shared update schemas. Keys outside the schema SHALL NOT reach persistence. `POST .../archive` SHALL soft-archive and `POST .../restore` SHALL reactivate; repeating either SHALL succeed with the same final state. Ownership and group-category admin rules SHALL be those of the existing services.

#### Scenario: Create account
- **WHEN** a write key posts a valid account
- **THEN** the response is 201 and the account belongs to the key's user

#### Scenario: Mass-assignment attempt
- **WHEN** a write key sends `PUT /v1/accounts/:id` with extra keys `userId` and `isArchived`
- **THEN** those keys are ignored (or rejected as 400) and the owner and archive state are unchanged

#### Scenario: Archive and restore
- **WHEN** a write key archives an account and then restores it
- **THEN** each returns 200, the transactions of the account are unchanged, and a second archive leaves it archived

#### Scenario: Cross-user account or category
- **WHEN** user A's write key calls PUT, archive or restore on user B's account or category
- **THEN** the response is 404 and B's record is unchanged

#### Scenario: Archived category on new transaction
- **WHEN** a transaction is created with an archived category
- **THEN** the request is rejected exactly as the internal API rejects it

### Requirement: Account and category deletion
`DELETE /v1/accounts/:id` and `DELETE /v1/categories/:id` SHALL invoke the same controller and service as the web app's `DELETE /accounts/:id` and `DELETE /categories/:id`, with identical authorization, business rules, status (204) and error responses. No guard SHALL be added beyond the web app's.

#### Scenario: Delete an account
- **WHEN** a write key deletes its own account
- **THEN** the response is 204, the account is gone, its transactions remain with a null account, and a transfer touching it keeps its other leg's account

#### Scenario: Delete a category
- **WHEN** a write key deletes its own category
- **THEN** the response is 204, the category is gone and its transactions remain uncategorized

#### Scenario: Read key refused
- **WHEN** a read-only key calls either DELETE route
- **THEN** the response is 403 and nothing is deleted

#### Scenario: Cross-user and repeat delete
- **WHEN** a write key deletes another user's id, or the same id twice
- **THEN** the response is 404 (the web app's not-found message) and the other user's record is unchanged

#### Scenario: Guarded case matches the web app
- **WHEN** a write key deletes a group category without being group admin
- **THEN** the response is the same error the web app returns

### Requirement: Transaction deletion
`DELETE /v1/transactions/:id` SHALL call the existing `deleteTransaction` service. It SHALL return 404 for another user's or missing id. It SHALL remove the related notifications and, via the schema, the linked shared expense with its participants and settlement requests. Deleting a transfer SHALL remove the single transfer row. Deleting a transaction created by an approved settlement SHALL leave the settlement request in place with its transaction link cleared. A repeated delete SHALL return 404.

#### Scenario: Cross-user delete
- **WHEN** user A's write key deletes user B's transaction
- **THEN** the response is 404 and B's transaction exists

#### Scenario: Delete transfer
- **WHEN** a write key deletes a transfer
- **THEN** the response is 204 and the transfer no longer affects either account's balance

#### Scenario: Delete with shared expense
- **WHEN** a write key deletes a transaction that has a shared expense with participants and a settlement request
- **THEN** the response is 204 and the shared expense, participants and settlement requests are gone

#### Scenario: Delete settlement payment
- **WHEN** a write key deletes a transaction generated by an approved settlement
- **THEN** the response is 204, the settlement request still exists with status approved and no transaction link

#### Scenario: Repeat delete
- **WHEN** the same delete is sent twice
- **THEN** the second response is 404

### Requirement: Read endpoints
`GET /v1/debts`, `/v1/reports/*`, `/v1/currencies`, `/v1/currencies/rate`, `/v1/notifications` and `/v1/imported-transactions` SHALL require `read`, reuse the internal validators and services, return only the credential owner's data, and never mutate. Imported transactions are listed here; their review actions are specified in "Imported-transaction review".

#### Scenario: Reports validated
- **WHEN** a client calls `GET /v1/reports/summary` with an invalid filter
- **THEN** the response is 400 with the existing validation error shape

#### Scenario: Reads scoped to owner
- **WHEN** user A calls the debts, notifications or imported-transactions list
- **THEN** no row belonging only to user B appears

### Requirement: Bounded list responses
`GET /v1/debts` and `GET /v1/imported-transactions` SHALL return at most 100 rows per list and include the total. `GET /v1/notifications` SHALL return at most 50. The caps SHALL NOT affect the internal routes.

#### Scenario: Oversized import queue
- **WHEN** the user has 250 imported transactions
- **THEN** 100 are returned with `total` 250

#### Scenario: Internal route unchanged
- **WHEN** the web app lists imported transactions through `/transactions/imported`
- **THEN** behaviour is identical to before this change

### Requirement: Imported-transaction review
`PATCH /v1/imported-transactions/:id`, `POST /v1/imported-transactions/:id/ignore`, `/unignore` and `/import` SHALL call the same controllers and services as the web app's `/transactions/imported/:id` routes with identical authorization, validation and errors; an id of another user or a missing id SHALL return 404 and a row in the wrong status SHALL return 400. The batch routes `POST /v1/imported-transactions/batch-ignore`, `/batch-unignore` and `/batch-import` SHALL accept only `{ selection: { mode: "ids", ids: [1 to 50 ids] } }` (plus an optional `categoryId` for import) and SHALL reject the `filtered` mode, an empty list and more than 50 ids with 400. A batch SHALL validate every row before changing any: one row in the wrong status or without a valid category returns 400 with a per-row `errors` list and changes nothing. Ids that are not the caller's SHALL be skipped without being acted on. Each route SHALL require `write` and be audited.

#### Scenario: Set category
- **WHEN** a write key patches a pending imported row with a category of the matching type
- **THEN** the response is 200 and the row has that category; a category of the wrong type returns 400

#### Scenario: Ignore and unignore
- **WHEN** a write key ignores a pending row and then unignores it
- **THEN** the status goes pending, ignored, pending; ignoring a non-pending row returns 400

#### Scenario: Import
- **WHEN** a write key imports a pending row that has a category
- **THEN** the response is 201, a transaction exists for the user, the row is processed, and importing it again returns 400

#### Scenario: Batch is all-or-nothing
- **WHEN** a batch includes one row that is not pending
- **THEN** the response is 400 listing that row and every other row is unchanged

#### Scenario: Batch limits
- **WHEN** a batch uses `mode: "filtered"`, an empty `ids`, or 51 ids
- **THEN** the response is 400 and nothing changes

#### Scenario: Cross-user
- **WHEN** user A's write key acts on user B's imported row
- **THEN** single routes return 404 and batch routes act on nothing; B's row is unchanged

#### Scenario: Read key
- **WHEN** a read-only key calls any review route
- **THEN** the response is 403 and nothing changes

### Requirement: Notification state
`GET /v1/notifications/unread-count` (read) SHALL return `{ count }` of the caller's unread notifications. `PATCH /v1/notifications/:id/read` and `PATCH /v1/notifications/read-all` (write) SHALL reuse the web controllers; the first returns 404 for another user's id and the second only affects the caller's notifications.

#### Scenario: Mark one read
- **WHEN** a write key marks its own notification read
- **THEN** the response is 200, the count drops by one, and another user's notification is untouched

#### Scenario: Cross-user notification
- **WHEN** a write key marks another user's notification read
- **THEN** the response is 404 and that notification stays unread

### Requirement: Own profile
`GET /v1/me` (read) SHALL return the caller's profile without the password hash. `PATCH /v1/me` (write) SHALL accept only `name` and `preferredCurrency` (null clears it, at least one required), SHALL call the existing profile update with the unchanged email, and SHALL NOT allow changing email, password or plan.

#### Scenario: Update preferences
- **WHEN** a write key sends `{ name, preferredCurrency }` plus `email`, `planType` and `password`
- **THEN** name and currency change and email, plan and password are unchanged

#### Scenario: Empty update
- **WHEN** a write key sends `{}`
- **THEN** the response is 400

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
