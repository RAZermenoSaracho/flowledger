## MODIFIED Requirements

### Requirement: Personal-finance tool set
The MCP server SHALL register, in addition to the existing six tools, these read tools for every credential: `list_debts`, `get_report`, `get_exchange_rate`, `list_notifications`, `list_imported_transactions`; and these write tools only for credentials holding the `write` scope: `create_account`, `update_account`, `set_account_archived`, `create_category`, `update_category`, `set_category_archived`, `delete_account`, `delete_category`, `delete_transaction`. Read tools SHALL carry `readOnlyHint: true`. `delete_account`, `delete_category` and `delete_transaction` SHALL carry `destructiveHint: true` and `idempotentHint: false`; `delete_account` and `delete_category` descriptions SHALL state that the delete is permanent, describe the effect on transactions, and instruct the assistant to obtain explicit user confirmation before calling. The `delete_transaction` description SHALL state that it is irreversible, removes only the caller's own transaction, and leaves other users' shares, payments and settlements unchanged. Archive tools SHALL carry `idempotentHint: true`.

#### Scenario: Read credential tool list
- **WHEN** a read-only credential lists tools
- **THEN** no write tool (including the three delete tools) is returned

#### Scenario: Write credential tool list
- **WHEN** a credential with `write` lists tools
- **THEN** 20 tools are returned and `delete_account`, `delete_category` and `delete_transaction` have `destructiveHint: true`

### Requirement: Transaction delete via MCP
`delete_transaction` SHALL behave exactly like the existing `deleteTransaction` service.

#### Scenario: Delete a plain transaction
- **WHEN** the owner deletes a transaction
- **THEN** it is gone, related notifications are removed, and a second call returns not found

#### Scenario: Delete a transfer
- **WHEN** the owner deletes a transfer transaction
- **THEN** the single transfer row, and therefore both legs, are removed

#### Scenario: Delete a transaction with a shared expense
- **WHEN** the owner deletes a transaction that has a shared expense in which another user has a financial stake
- **THEN** only the owner's transaction is removed and the shared expense, participants and settlement requests remain unchanged

#### Scenario: Delete a settlement payment transaction
- **WHEN** the owner deletes a transaction created by an approved settlement
- **THEN** the settlement request remains with its status, only the caller's link to that transaction is cleared, and the other user's records are unchanged
