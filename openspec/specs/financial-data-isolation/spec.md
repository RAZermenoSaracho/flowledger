# financial-data-isolation Specification

## Purpose
Defines the server-side rules for who can read and change financial records, and the regression coverage that keeps every user's data separate from every other user's.

## Requirements

### Requirement: Protected routes require authentication

Every route that reads or changes user data SHALL reject an unauthenticated request with 401. Only explicitly public routes SHALL be reachable without credentials: health, currencies, public auth entry points, the provider webhook, OAuth metadata and token endpoints, and public avatar files.

#### Scenario: Anonymous request to a protected module
- **WHEN** a request with no credential reaches accounts, categories, groups, notifications, providers, debts, settlements, transactions, shared expenses, reports, users, API-key, or OAuth-grant routes
- **THEN** the response is 401

### Requirement: Users cannot reach other users' records

A user SHALL NOT read or change another user's accounts, transactions, imported transactions, categories, notifications, API keys, or OAuth grants. A request for another user's record SHALL receive the same response as a missing record.

#### Scenario: Read another user's record
- **WHEN** a user requests a record owned by a second user by id
- **THEN** the response is 404 with no record data

#### Scenario: Change another user's record
- **WHEN** a user updates or deletes a record owned by a second user
- **THEN** the response is 404 and the record is unchanged

#### Scenario: Bulk operation with another user's ids
- **WHEN** a batch import, ignore, or unignore includes a second user's ids
- **THEN** that user's rows are unchanged

#### Scenario: Query cannot widen its scope
- **WHEN** a list request sends a filter expression designed to match every owner, including a top-level `or`
- **THEN** only the caller's records are returned

### Requirement: Shared records expose only what participants need

A shared-expense participant SHALL see the shared amount, description, date, currency, and share details, and SHALL NOT see the owner's account, notes, or personal category. The owner SHALL continue to see the whole transaction. Other users in a shared record (owner, participants, counterparties) SHALL be exposed only as public identities (`id`, `username`, `displayName`), never with email or phone. A participant who is not a member of the transaction's Group SHALL NOT receive any Group data.

#### Scenario: Participant reads a shared expense
- **WHEN** a non-owner participant lists or opens a shared expense
- **THEN** the response omits the transaction's account, notes, category, and exchange details

#### Scenario: Owner reads a shared expense
- **WHEN** the owner lists or opens the same shared expense
- **THEN** the full transaction is returned

#### Scenario: Non-participant
- **WHEN** a user who is neither owner nor participant requests the shared expense
- **THEN** the response is 404

#### Scenario: Public identities only
- **WHEN** a participant or owner reads a shared expense
- **THEN** other users appear only as `{ id, username, displayName }`

#### Scenario: Non-member participant
- **WHEN** a participant outside the transaction's Group reads the shared expense
- **THEN** the response contains no group name, members or categories

### Requirement: Settlement and group actions are limited to the right role

Only a debt's creditor SHALL settle it directly or approve or reject its requests. Only a group admin SHALL change group settings, membership, or group categories. These checks SHALL be applied in the server's data query.

#### Scenario: Debtor attempts to approve
- **WHEN** a debtor approves their own settlement request
- **THEN** the response is 404 and nothing changes

#### Scenario: Non-creditor settles directly
- **WHEN** anyone except the creditor settles a debt directly
- **THEN** the response is 404 and nothing changes

#### Scenario: Group member attempts an admin action
- **WHEN** a non-admin member changes group settings or membership
- **THEN** the request is rejected and nothing changes

### Requirement: User search limits enumeration

Web user search SHALL match by username only (exact match first, then prefix), require at least three characters, return at most 10 results, exclude the caller and users blocked in either direction, and be rate limited per user. It SHALL NOT match on or return email, phone or name, and SHALL require authentication.

#### Scenario: Short query
- **WHEN** a signed-in user searches with fewer than three characters
- **THEN** the response is 400

#### Scenario: Result cap
- **WHEN** a query matches more than 10 users
- **THEN** at most 10 are returned

#### Scenario: Email query
- **WHEN** the query equals another user's email
- **THEN** that user is not returned

#### Scenario: Blocked user hidden
- **WHEN** the caller and a match have a block in either direction
- **THEN** the match is not returned

### Requirement: Queries can't reach private fields through relations

A user-supplied query SHALL NOT filter, sort, or group on another user's record or on any stored hash through a relation path. Shared-expense lists SHALL accept only the shared expense's own public fields, because participants can list them.

#### Scenario: Hash through a relation
- **WHEN** a query uses `owner.passwordHash`, `group.owner.passwordHash`, or a similar path, on any list
- **THEN** the response is 400 and no query runs

#### Scenario: Owner-only field as a participant
- **WHEN** a participant filters shared expenses on `transaction.notes`
- **THEN** the response is 400
