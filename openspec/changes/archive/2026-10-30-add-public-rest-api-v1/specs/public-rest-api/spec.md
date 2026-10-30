## Purpose

Defines the key-authenticated `/v1` REST surface: an explicit allowlist of read and write operations on the owner's accounts, categories and transactions, with scope enforcement, bounded pagination and auditing of writes.

## ADDED Requirements

### Requirement: Explicit route allowlist
The system SHALL expose exactly these routes under `/v1`: GET `/v1/accounts`, GET `/v1/categories`, GET `/v1/transactions`, GET `/v1/transactions/summary`, GET `/v1/transactions/:id`, POST `/v1/transactions`, PUT `/v1/transactions/:id`. Every other method/path under `/v1` SHALL return 404 with a JSON body `{ "message": ... }`.

#### Scenario: Listed route works
- **WHEN** a valid key with sufficient scope calls a listed route with valid input
- **THEN** the response has the same status and body shape as the equivalent internal route (200, or 201 for POST)

#### Scenario: Unlisted route
- **WHEN** an authenticated client calls `GET /v1/reports`, `GET /v1/groups` or `POST /v1/accounts`
- **THEN** the response is 404 with a JSON message

#### Scenario: DELETE is not exposed
- **WHEN** an authenticated client calls `DELETE /v1/transactions/:id`
- **THEN** the response is 404 and the transaction is unchanged

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
GET routes SHALL require the `read` scope; POST and PUT routes SHALL require `write`. A key with `write` SHALL also satisfy `read`. A missing scope SHALL return 403.

#### Scenario: Read key writes
- **WHEN** a read-only key calls `POST /v1/transactions` or `PUT /v1/transactions/:id`
- **THEN** the response is 403 and nothing is created or changed

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
Each POST and PUT under `/v1`, whether it succeeds or fails after authentication and scope checks, SHALL emit exactly one audit log line with user id, credential kind and id, operation, resource id when known, and HTTP status. The line SHALL NOT contain secrets or request bodies. A request rejected for missing scope SHALL also be audited with status 403.

#### Scenario: Successful create
- **WHEN** a write key creates a transaction
- **THEN** one audit line has `op` for create, the new transaction id and status 201

#### Scenario: Failed update
- **WHEN** a write key updates another user's transaction
- **THEN** one audit line records status 404 and the requested id

#### Scenario: Reads not audited
- **WHEN** a GET succeeds
- **THEN** no audit line is emitted
