# Spec Delta

## MODIFIED Requirements

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
