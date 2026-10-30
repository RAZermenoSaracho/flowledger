# Spec Delta

## Purpose

Defines the remote MCP endpoint through which AI clients act as an authenticated FlowLedger user, with a minimal scope-gated tool surface that reuses existing business rules.

## ADDED Requirements

### Requirement: Single stateless POST endpoint
The system SHALL serve MCP at `/mcp` over HTTP POST only, statelessly and with plain JSON responses (no SSE stream, no session identifier). `GET /mcp` and `DELETE /mcp` SHALL return 405.

#### Scenario: Tool call round trip
- **WHEN** a client POSTs a valid MCP `tools/call` request with a valid credential
- **THEN** the response is a single JSON body containing the result and no `Mcp-Session-Id` header is issued

#### Scenario: Unsupported methods
- **WHEN** a client sends `GET /mcp` or `DELETE /mcp`
- **THEN** the response status is 405 with an `Allow: POST` header

### Requirement: Credential authentication
The system SHALL require `Authorization: Bearer <credential>` on every `/mcp` request, accepting API keys. A web session token SHALL NOT be accepted. A missing, malformed, unknown, revoked or expired credential SHALL yield 401 with a `WWW-Authenticate: Bearer` header carrying `error="invalid_token"`. Until OAuth support exists the header SHALL NOT carry a `resource_metadata` parameter.

#### Scenario: Missing credential
- **WHEN** a request has no Authorization header
- **THEN** the response is 401 with `WWW-Authenticate: Bearer error="invalid_token"`

#### Scenario: Web session token
- **WHEN** a request presents a valid web session JWT as the bearer token
- **THEN** the response is 401

#### Scenario: Revoked or expired key
- **WHEN** a request presents an API key that has been revoked or has expired
- **THEN** the response is 401 on that very request

#### Scenario: Key that never expires
- **WHEN** a request presents a valid API key created with lifetime "never"
- **THEN** the request is authenticated

### Requirement: Identity comes only from the verified credential
The system SHALL derive the acting user and scopes solely from the verified credential. No tool input SHALL be able to name or override the user. The MCP adapter SHALL read identity only from the authenticated request context so that additional credential kinds can be supported by changing credential verification alone.

#### Scenario: Cross-user isolation
- **WHEN** user A's credential is used to list accounts, search transactions, or update a transaction id that belongs to user B
- **THEN** none of user B's data is returned and the update is refused as "not found"

### Requirement: Tool surface
The system SHALL expose exactly these tools and no others: `list_accounts`, `list_categories`, `search_transactions`, `get_transaction_summary` (read), and `create_transaction`, `update_transaction` (write). Read tools SHALL be annotated read-only; `update_transaction` SHALL be annotated idempotent.

#### Scenario: Tool listing for a write credential
- **WHEN** a client lists tools with a credential holding `read` and `write`
- **THEN** exactly the six tools are returned

### Requirement: Read-scoped credentials cannot see or use write tools
The system SHALL register `create_transaction` and `update_transaction` only when the credential holds the `write` scope, and SHALL refuse a write-tool call from any credential lacking it.

#### Scenario: Read key hides write tools
- **WHEN** a client lists tools with a read-only credential
- **THEN** only the four read tools are returned

#### Scenario: Read key calls a write tool
- **WHEN** a client with a read-only credential calls `create_transaction` or `update_transaction`
- **THEN** the call fails with an error result or protocol error and no transaction is created or changed

### Requirement: Search and summary filtering
`search_transactions` SHALL accept optional `dateFrom`, `dateTo`, `accountId`, `categoryId`, `text`, `type`, `page` and `pageSize`, return transactions newest first, and cap `pageSize` at 100 (default 50). `get_transaction_summary` SHALL accept the same filters except paging and return income, expenses and balance for the matching transactions. Inputs outside the schema, including `pageSize` above 100, SHALL be rejected.

#### Scenario: Filtered search
- **WHEN** a client searches with `type: "expense"` and a date range
- **THEN** only the user's expense transactions within that inclusive range are returned with paging metadata

#### Scenario: Page size cap
- **WHEN** a client searches with `pageSize: 101`
- **THEN** the call is rejected with a validation error

### Requirement: Write tools reuse existing validation and ownership
`create_transaction` SHALL accept the same fields and obey the same rules as creating a transaction in the web app; `update_transaction` SHALL accept a transaction id plus the same optional fields as the web update. Referencing an account, category or group the user does not own SHALL be refused.

#### Scenario: Create with a write key
- **WHEN** a write credential calls `create_transaction` with valid fields
- **THEN** the transaction is created for the credential's user and returned

#### Scenario: Create referencing another user's account
- **WHEN** a write credential calls `create_transaction` with an `accountId` owned by another user
- **THEN** the result is an error and nothing is created

### Requirement: Result and error format
Successful tool results SHALL contain machine-readable structured content and an identical JSON text copy, and SHALL contain no instructions or guidance text. Failures raised by business rules or validation SHALL be returned as tool results flagged as errors with a short message; unexpected failures SHALL return a generic message that exposes no internal detail.

#### Scenario: Not found
- **WHEN** `update_transaction` targets a nonexistent id
- **THEN** the result is flagged as an error with the message "Transaction not found"

#### Scenario: Unexpected failure
- **WHEN** a service throws an unexpected error
- **THEN** the result is flagged as an error with a generic message and the detail is only logged server-side

### Requirement: REST/MCP parity
For the same user and equivalent input, a read tool SHALL return the same data as the corresponding REST read endpoint, and a refused operation SHALL be refused in both.

#### Scenario: Transactions parity
- **WHEN** the same user searches transactions with the same filter through MCP and through REST
- **THEN** the returned transactions and paging totals are identical

### Requirement: Origin validation
The system SHALL reject any `/mcp` request that carries an `Origin` header with 403, before authentication. Requests with no `Origin` header (server-to-server and CLI clients) SHALL be processed normally.

#### Scenario: Browser-originated request
- **WHEN** a request to `/mcp` carries `Origin: https://evil.example`
- **THEN** the response is 403

#### Scenario: Non-browser client
- **WHEN** a request has no Origin header and a valid credential
- **THEN** it is processed normally

### Requirement: Write audit and rate limiting
Every `create_transaction` and `update_transaction` call, successful or failed, SHALL emit exactly one structured audit log line identifying the user, credential kind, credential id, operation, resource id and outcome, containing no secrets and no request body. `/mcp` SHALL be rate limited per credential (or per client address when unauthenticated); exceeding the limit SHALL yield 429.

#### Scenario: Audit line on write
- **WHEN** a write credential creates a transaction
- **THEN** one audit line is logged with the credential id and the new transaction id and without the bearer token or amounts

#### Scenario: Rate limit
- **WHEN** a client exceeds the configured request rate on `/mcp`
- **THEN** further requests receive 429 until the window resets
