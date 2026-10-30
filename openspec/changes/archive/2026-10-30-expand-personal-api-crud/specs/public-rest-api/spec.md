## MODIFIED Requirements

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

## ADDED Requirements

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
