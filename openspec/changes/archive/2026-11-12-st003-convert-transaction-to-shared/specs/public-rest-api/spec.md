# Spec Delta

## MODIFIED Requirements

### Requirement: Explicit route allowlist
The system SHALL expose exactly these routes under `/v1`:
- Existing: GET `/v1/accounts`, GET `/v1/categories`, GET `/v1/transactions`, GET `/v1/transactions/summary`, GET `/v1/transactions/:id`, POST `/v1/transactions`, PUT `/v1/transactions/:id`.
- Reads: GET `/v1/debts`, GET `/v1/reports/summary`, GET `/v1/reports/by-category`, GET `/v1/reports/monthly-cashflow`, GET `/v1/currencies`, GET `/v1/currencies/rate`, GET `/v1/notifications`, GET `/v1/imported-transactions`, GET `/v1/notifications/unread-count`, GET `/v1/me`.
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

### Requirement: Shared expense creation
`POST /v1/shared-expenses` SHALL validate the body with `sharedExpenseSchema`, SHALL require the referenced transaction to be owned by the caller (404 for a foreign or missing transaction), and SHALL apply the same participant rules as the web: any existing app user who is not blocked, plus manual participants, on group and non-group transactions, owner excluded, shares not exceeding the amount. App-user participants SHALL be created `proposed`.

#### Scenario: Non-group transaction
- **WHEN** the transaction has no group and the participants are valid
- **THEN** the response is 201 and the participants are notified

#### Scenario: Non-member participant
- **WHEN** a participant is not a member of the transaction's group
- **THEN** the response is 201 and the participant sees only the shared expense summary

#### Scenario: Blocked participant
- **WHEN** a participant has blocked the caller
- **THEN** the response is 400 "This user can't be invited." and nothing is created

#### Scenario: Foreign transaction
- **WHEN** the transaction belongs to another user
- **THEN** the response is 404

#### Scenario: Valid
- **WHEN** an owner posts a valid shared expense
- **THEN** the response is 201, shares are `proposed` and participants are notified

### Requirement: User search
`GET /v1/users/search` (`read`) SHALL match username only (exact first, then prefix), return other users as `{ id, username, displayName }` only, exclude the caller and users blocked in either direction, require a query of at least 3 characters and return at most 10 results, with the same per-user limiter as the web. A shorter query or a limit above 10 SHALL be rejected with 400.

#### Scenario: Short query
- **WHEN** `q` has fewer than 3 characters
- **THEN** the response is 400

#### Scenario: Result cap
- **WHEN** more than 10 users match
- **THEN** at most 10 are returned and the caller is never among them

#### Scenario: No email or name matching
- **WHEN** `q` equals a user's email
- **THEN** that user is not returned and no result contains an email

### Requirement: Group member add
`POST /v1/groups/:id/members` SHALL add the user named by `userId` as a `member`, only for a group admin and an active group; the target is notified and gains access to the group's categories. The response SHALL contain the added user's public identity only. A non-admin member or non-member SHALL receive 404, a read key 403, an existing member 409, an unknown user or self or archived group 400.

#### Scenario: Admin adds
- **WHEN** an admin posts a valid `userId`
- **THEN** the response is 201, the user is a member, a notification exists and no email is returned

#### Scenario: Non-admin
- **WHEN** a non-admin member or a stranger posts
- **THEN** the response is 404 and nothing changes

#### Scenario: Read key
- **WHEN** a read-only key posts
- **THEN** the response is 403 and nothing changes

## ADDED Requirements

### Requirement: Consent and blocking routes

`/v1` SHALL additionally expose `POST /v1/shared-expenses/:id/accept` and `/reject` (`write`), `GET /v1/users/blocks` (`read`), and `POST /v1/users/blocks` and `DELETE /v1/users/blocks/:userId` (`write`), each reusing the web controller, validator and service. `PUT` and `DELETE /v1/shared-expenses/:id` SHALL remain unrouted. Responses SHALL use public identities.

#### Scenario: Accept via v1
- **WHEN** a participant's write key accepts a proposed share
- **THEN** the share becomes `accepted` exactly as on the web

#### Scenario: Not the participant
- **WHEN** another user's key calls accept
- **THEN** the response is 404

#### Scenario: Read key refused
- **WHEN** a read-only key calls accept, reject, block or unblock
- **THEN** the response is 403 and nothing changes

#### Scenario: Block parity
- **WHEN** a key blocks a user
- **THEN** the effects match the web block

### Requirement: Own profile identity fields

`GET /v1/me` SHALL include `username` and `identityVisibility` with the owner's private fields. `PATCH /v1/me` SHALL remain limited to `name` and `preferredCurrency`; username and visibility are changed only in the web Profile.

#### Scenario: Read own profile
- **WHEN** a read key calls `GET /v1/me`
- **THEN** username and visibility are present

#### Scenario: PATCH ignores username
- **WHEN** a write key sends `username`
- **THEN** it is not changed
