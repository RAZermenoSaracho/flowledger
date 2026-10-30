# personal-api-keys Specification

## Purpose
Let a signed-in user create, list and revoke personal API keys that authenticate as that user with limited scope and lifetime, and provide the credential verification primitives that later API surfaces build on.

## Requirements

### Requirement: Create an API key
A signed-in user (web session) SHALL be able to create an API key by providing a name, whether write access is allowed (default no), and a lifetime of `1d`, `1m` (default), `1y` or `never`. The response SHALL contain the full key exactly once.

#### Scenario: Create a read-only key with defaults
- **WHEN** an authenticated user POSTs `/users/me/api-keys` with only a name
- **THEN** the response is 201 with the key in the form `fl_` followed by a base64url secret, `scopes` equal to `["read"]`, and `expiresAt` one calendar month from now

#### Scenario: Create a write key
- **WHEN** the user explicitly sets write access and lifetime `1y`
- **THEN** `scopes` equals `["read","write"]` and `expiresAt` is one calendar year from now

#### Scenario: Never-expiring key
- **WHEN** the user chooses lifetime `never`
- **THEN** `expiresAt` is null

#### Scenario: Invalid input
- **WHEN** the name is empty or the lifetime is not one of the allowed values
- **THEN** the response is 400 and no key is created

### Requirement: Secret shown once and never persisted in plaintext
The system SHALL store only a SHA-256 hash of the key and a short display hint (first 8 characters). The plaintext SHALL appear only in the create response and SHALL NOT be logged or returned by any other endpoint.

#### Scenario: List does not expose secrets
- **WHEN** the user lists their keys
- **THEN** each item has id, name, hint, scopes, expiresAt, revokedAt, lastUsedAt and createdAt, and no secret or hash

### Requirement: List and revoke own keys
A user SHALL be able to list only their own keys and revoke any of their own keys. Revocation SHALL be immediate and idempotent.

#### Scenario: Revoke
- **WHEN** the user DELETEs `/users/me/api-keys/:id` for their key
- **THEN** the key's `revokedAt` is set and the response is 204

#### Scenario: Another user's key
- **WHEN** user A revokes or looks up a key id owned by user B
- **THEN** the response is 404 and B's key is unchanged

### Requirement: Key management requires a web session
`/users/me/api-keys` SHALL accept only a web JWT. An API key SHALL NOT be able to create, list or revoke keys.

#### Scenario: Key used against key management
- **WHEN** a request to `/users/me/api-keys` carries `Authorization: Bearer fl_...`
- **THEN** the response is 401

### Requirement: Credential verification
The system SHALL verify an `fl_` bearer token by looking up its SHA-256 hash and SHALL accept it only if the key is not revoked, not expired and its user exists. It SHALL resolve to the owner's id and email, the key's scopes, kind `apiKey` and the key id. Any other token, including a web JWT, SHALL be rejected with 401.

#### Scenario: Valid key
- **WHEN** a valid key is presented to a route guarded by credential middleware
- **THEN** the request proceeds acting as the key's owner

#### Scenario: Revoked, expired, unknown or malformed
- **WHEN** the key is revoked, past `expiresAt`, unknown, lacks the `fl_` prefix, or the token is a web JWT
- **THEN** the response is 401 on that request

#### Scenario: Owner deleted
- **WHEN** the owning user is deleted
- **THEN** their keys are deleted and the key no longer authenticates

### Requirement: Scope enforcement
A route guarded by write scope SHALL return 403 for a credential lacking `write`. `write` SHALL imply `read`.

#### Scenario: Read key on write route
- **WHEN** a read-only key calls a route requiring `write`
- **THEN** the response is 403

#### Scenario: Write key on read route
- **WHEN** a read+write key calls a route requiring `read`
- **THEN** the request proceeds

### Requirement: Last-used tracking
Using a key SHALL update `lastUsedAt` at most once every 5 minutes without delaying the request.

#### Scenario: Throttled update
- **WHEN** a key is used twice within 5 minutes
- **THEN** `lastUsedAt` is written at most once

### Requirement: Developer page
The web app SHALL provide `/profile/developer`, linked from Profile, with an API keys section (list showing name, hint, permissions, expiry as absolute date and relative days, last used; create form; revoke) and a static "Connect an AI client" section with copyable instructions using `PUBLIC_API_URL`-derived MCP URL text.

#### Scenario: One-time reveal
- **WHEN** a key is created
- **THEN** a native dialog shows the key in monospace with a Copy button and a "won't be shown again" notice, and it closes only after the user acknowledges it, after which the secret is no longer in the page state

#### Scenario: Never lifetime warning
- **WHEN** the user selects `never`
- **THEN** a text warning (not colour alone) is shown

#### Scenario: Revoke confirmation
- **WHEN** the user clicks Revoke
- **THEN** a native dialog names the key and revokes only after confirmation

### Requirement: Audit log line
The system SHALL provide a helper that writes one JSON line to stdout for a write operation: `audit: true`, ts, userId, credentialKind, credentialId, op, resourceId, status. It SHALL NOT include secrets or request bodies.

#### Scenario: Audit output
- **WHEN** the helper is called with an operation and status
- **THEN** exactly one JSON line with those fields is written and no body or token appears

### Requirement: Deployment configuration
The API SHALL read `PUBLIC_API_URL` through the validated env schema (default `http://localhost:${API_PORT}`), SHALL trust one proxy hop, and SHALL provide a rate-limiter factory keyed by credential hash or client IP.

#### Scenario: Limiter key
- **WHEN** the limiter handles a request with a bearer token
- **THEN** it is keyed by the token's hash, otherwise by client IP
