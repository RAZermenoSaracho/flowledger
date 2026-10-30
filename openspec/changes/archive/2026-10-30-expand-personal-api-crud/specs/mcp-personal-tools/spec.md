## ADDED Requirements

### Requirement: Personal-finance tool set
The MCP server SHALL register, in addition to the existing six tools, these read tools for every credential: `list_debts`, `get_report`, `get_exchange_rate`, `list_notifications`, `list_imported_transactions`; and these write tools only for credentials holding the `write` scope: `create_account`, `update_account`, `set_account_archived`, `create_category`, `update_category`, `set_category_archived`, `delete_account`, `delete_category`, `delete_transaction`. Read tools SHALL carry `readOnlyHint: true`. `delete_account`, `delete_category` and `delete_transaction` SHALL carry `destructiveHint: true` and `idempotentHint: false`; `delete_account` and `delete_category` descriptions SHALL state that the delete is permanent, describe the effect on transactions, and instruct the assistant to obtain explicit user confirmation before calling. The `delete_transaction` description SHALL state that it is irreversible and also deletes the linked shared expense, its participants and settlement requests. Archive tools SHALL carry `idempotentHint: true`.

#### Scenario: Read credential tool list
- **WHEN** a read-only credential lists tools
- **THEN** no write tool (including the three delete tools) is returned

#### Scenario: Write credential tool list
- **WHEN** a credential with `write` lists tools
- **THEN** 20 tools are returned and `delete_account`, `delete_category` and `delete_transaction` have `destructiveHint: true`

### Requirement: Read credentials cannot mutate
A tool call that mutates data SHALL be refused for a credential without `write`, even if the client names the tool directly, and SHALL change nothing.

#### Scenario: Read key calls delete_transaction
- **WHEN** a read-only credential calls `delete_transaction` for its own transaction
- **THEN** the call is refused and the transaction still exists

### Requirement: Ownership and identity
Every new tool SHALL act only as the credential's user, with ownership enforced by the existing service. An id belonging to another user SHALL be indistinguishable from a missing one. The tool inputs SHALL NOT include a user id.

#### Scenario: Cross-user mutation
- **WHEN** user A's write credential calls `update_account`, `set_account_archived`, `update_category` or `delete_transaction` with user B's id
- **THEN** the result is a not-found error and B's data is unchanged

#### Scenario: Cross-user reads
- **WHEN** user A calls `list_debts`, `list_notifications` or `list_imported_transactions`
- **THEN** no row belonging only to user B is returned

### Requirement: Validation reuses shared schemas
Write tool inputs SHALL be parsed with the same shared Zod schemas as the REST routes, and keys outside the schema SHALL NOT reach the service.

#### Scenario: Unknown key ignored
- **WHEN** `update_account` is called with an extra key such as `userId` or `isArchived`
- **THEN** the key has no effect on the stored account

#### Scenario: Invalid input
- **WHEN** `create_category` is called with an invalid `type`
- **THEN** the result is an error and nothing is created

### Requirement: Archive semantics
`set_account_archived` and `set_category_archived` with `archived: true` SHALL soft-archive the record and with `archived: false` SHALL restore it. Repeating the same call SHALL leave the same final state. Permanent removal is the separate `delete_account` / `delete_category` tools.

#### Scenario: Archive then restore
- **WHEN** an account is archived and then restored
- **THEN** its transactions are untouched and the account is active again

### Requirement: Account and category delete via MCP
`delete_account` and `delete_category` SHALL call the same services as the web app's delete routes with the credential's user id, with no added guards, and SHALL return `{ deleted: true, id }`. Service errors SHALL surface as an MCP error result carrying the same message as the web/REST response.

#### Scenario: Delete an account
- **WHEN** a write credential calls `delete_account` for its own account
- **THEN** the account is gone and its transactions remain with a null account

#### Scenario: Delete a category
- **WHEN** a write credential calls `delete_category` for its own category
- **THEN** the category is gone and its transactions remain uncategorized

#### Scenario: Read credential refused
- **WHEN** a read-only credential calls `delete_account` or `delete_category`
- **THEN** the call is refused and nothing is deleted

#### Scenario: Same error as the web path
- **WHEN** a write credential deletes another user's or an already-deleted id
- **THEN** the result is an error whose message equals the REST not-found message

### Requirement: Transaction delete via MCP
`delete_transaction` SHALL behave exactly like the existing `deleteTransaction` service.

#### Scenario: Delete a plain transaction
- **WHEN** the owner deletes a transaction
- **THEN** it is gone, related notifications are removed, and a second call returns not found

#### Scenario: Delete a transfer
- **WHEN** the owner deletes a transfer transaction
- **THEN** the single transfer row, and therefore both legs, are removed

#### Scenario: Delete a transaction with a shared expense
- **WHEN** the owner deletes a transaction that has a shared expense
- **THEN** the shared expense, its participants and their settlement requests are removed

#### Scenario: Delete a settlement payment transaction
- **WHEN** the owner deletes a transaction created by an approved settlement
- **THEN** the settlement request remains with its status and its link to that transaction is cleared

### Requirement: Bounded lists
`list_debts` and `list_imported_transactions` SHALL return at most 100 rows per list and report the total. `list_notifications` SHALL return at most 50.

#### Scenario: Oversized import queue
- **WHEN** the user has 250 imported transactions
- **THEN** 100 rows are returned with `total` 250

### Requirement: Write audit
Each new write tool call, successful or failed, SHALL emit exactly one audit line with user id, credential kind and id, operation (`mcp.<tool>`), resource id when known and status, and no request body.

#### Scenario: Failed delete is audited
- **WHEN** a write credential calls `delete_transaction` with another user's id
- **THEN** one audit line records status 404 and the requested id

### Requirement: Report tool
`get_report` SHALL accept `type` of `summary`, `by_category` or `monthly_cashflow` plus the shared report filters, and SHALL return the same data as the corresponding REST route.

#### Scenario: Parity
- **WHEN** `get_report` and `GET /v1/reports/by-category` are called with the same filters
- **THEN** the data is equal

### Requirement: Parity tools
The MCP server SHALL register for every credential the read tools `get_transaction`, `list_currencies` and `get_profile` (all `readOnlyHint: true`), and only for credentials holding `write` the tools `update_imported_transaction`, `ignore_imported_transactions`, `unignore_imported_transactions`, `import_imported_transactions`, `update_preferences` and `mark_notifications_read`. `list_notifications` SHALL also return `unreadCount`. The ignore, unignore and import tools SHALL take `ids` (1 to 50) and no selection mode; the `import_imported_transactions` description SHALL say it creates real transactions and instruct the assistant to obtain explicit user confirmation. `update_preferences` SHALL accept only `name` and `preferredCurrency`. `mark_notifications_read` SHALL take exactly one of `id` or `all: true`. Each tool SHALL use the same services, validation and errors as its REST counterpart and each write SHALL emit one `mcp.<tool>` audit line.

#### Scenario: Tool visibility
- **WHEN** a read-only credential lists tools
- **THEN** the three read tools are present and none of the six write tools is

#### Scenario: Read credential refused
- **WHEN** a read-only credential calls any of the six write tools
- **THEN** the call is refused and nothing changes

#### Scenario: Non-pending row
- **WHEN** `ignore_imported_transactions` or `import_imported_transactions` includes a row that is not in the required status
- **THEN** the result is an error naming that row and every row is unchanged

#### Scenario: Limits
- **WHEN** an imported tool is called with more than 50 ids, no ids, or a selection object
- **THEN** the result is an error and nothing changes

#### Scenario: Cross-user
- **WHEN** user A calls `get_transaction`, `update_imported_transaction` or `mark_notifications_read` with user B's id
- **THEN** the result is a not-found error; the ignore/unignore/import tools act on nothing for B's ids

#### Scenario: REST parity
- **WHEN** the same user calls `get_transaction`, `list_currencies`, `get_profile` and the matching `/v1` routes
- **THEN** the data is equal; `list_notifications.unreadCount` equals `GET /v1/notifications/unread-count`

#### Scenario: Preferences limited
- **WHEN** `update_preferences` is called with `name`, `preferredCurrency` and an `email`
- **THEN** name and currency change and the email is unchanged
