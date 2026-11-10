# Spec Delta

## MODIFIED Requirements

### Requirement: Ownership and identity
Every new tool SHALL act only as the credential's user, with ownership enforced by the existing service. An id belonging to another user SHALL be indistinguishable from a missing one. The tool inputs SHALL NOT include a user id. Other users in tool outputs (for example `list_debts` counterparties) SHALL be public identities (`id`, `username`, `displayName`) without email or phone; `get_profile` SHALL return the caller's own private fields plus `username` and `identityVisibility`. `list_debts` SHALL count only accepted shares and list proposed shares as awaiting acceptance.

#### Scenario: Cross-user mutation
- **WHEN** user A's write credential calls `update_account`, `set_account_archived`, `update_category` or `delete_transaction` with user B's id
- **THEN** the result is a not-found error and B's data is unchanged

#### Scenario: Cross-user reads
- **WHEN** user A calls `list_debts`, `list_notifications` or `list_imported_transactions`
- **THEN** no row belonging only to user B is returned

#### Scenario: Counterparty identity
- **WHEN** `list_debts` returns counterparties
- **THEN** each is `{ id, username, displayName }` with no email

#### Scenario: Awaiting acceptance
- **WHEN** a share is proposed
- **THEN** `list_debts` lists it as awaiting acceptance and excludes it from totals
