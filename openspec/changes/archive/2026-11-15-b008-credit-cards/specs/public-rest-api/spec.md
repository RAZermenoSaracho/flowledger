# Spec Delta

## MODIFIED Requirements

### Requirement: Explicit route allowlist
The system SHALL expose exactly these routes under `/v1`:
- Existing: GET `/v1/accounts`, GET `/v1/categories`, GET `/v1/transactions`, GET `/v1/transactions/summary`, GET `/v1/transactions/:id`, POST `/v1/transactions`, PUT `/v1/transactions/:id`.
- Reads: GET `/v1/debts`, GET `/v1/reports/summary`, GET `/v1/reports/by-category`, GET `/v1/reports/monthly-cashflow`, GET `/v1/currencies`, GET `/v1/currencies/rate`, GET `/v1/notifications`, GET `/v1/imported-transactions`, GET `/v1/notifications/unread-count`, GET `/v1/me`, GET `/v1/accounts/:id/credit-card`.
- Writes: POST `/v1/accounts`, PUT `/v1/accounts/:id`, POST `/v1/accounts/:id/archive`, POST `/v1/accounts/:id/restore`, POST `/v1/categories`, PUT `/v1/categories/:id`, POST `/v1/categories/:id/archive`, POST `/v1/categories/:id/restore`, DELETE `/v1/transactions/:id`, DELETE `/v1/accounts/:id`, DELETE `/v1/categories/:id`, PATCH `/v1/notifications/:id/read`, PATCH `/v1/notifications/read-all`, PATCH `/v1/me`, PATCH `/v1/imported-transactions/:id`, POST `/v1/imported-transactions/:id/{ignore,unignore,import}`, POST `/v1/imported-transactions/batch-{ignore,unignore,import}`.

- Consent, blocking and discovery: POST `/v1/shared-expenses/:id/accept`, POST `/v1/shared-expenses/:id/reject`, POST `/v1/users/blocks`, DELETE `/v1/users/blocks/:userId` (`write`); GET `/v1/users/blocks`, GET `/v1/users/search` (`read`). `GET /v1/users/username-availability` is web-only and stays unrouted.

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

## ADDED Requirements

### Requirement: Credit-card billing route
`GET /v1/accounts/:id/credit-card` SHALL require `read`, reuse the internal controller, service and validation, and return the same body as the internal route. Another user's account, or a non-card account, SHALL return 404. Credit-card configuration and `creditCardKind` SHALL be accepted through the existing account and transaction write routes. No payment, statement or billing write route SHALL exist.

#### Scenario: Read key reads billing data
- **WHEN** a read key calls `GET /v1/accounts/:id/credit-card` for its own card
- **THEN** the response equals the internal one

#### Scenario: Cross-user
- **WHEN** user A's key requests user B's card
- **THEN** the response is 404
