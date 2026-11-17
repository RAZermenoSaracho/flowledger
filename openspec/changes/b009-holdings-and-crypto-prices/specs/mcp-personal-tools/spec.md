# Spec Delta

## ADDED Requirements

### Requirement: Holdings tools
The MCP server SHALL register two tools:
- `list_holdings` (`readOnlyHint: true`) for every credential;
- `update_holdings` only for credentials holding the `write` scope.

**`list_holdings`:** It takes an account id. It SHALL return the same body as `GET /accounts/:id/holdings`.

**`update_holdings`:** It takes an account id plus the `{ upsert, remove }` change set. Its behavior SHALL match `PATCH /accounts/:id/holdings`, with the same shared-schema validation, atomicity, ownership and errors.
- Its description SHALL state these rules:
  - holdings not mentioned are untouched;
  - `remove` permanently deletes holdings;
  - quantities and prices are exact decimal strings.
- It SHALL carry `destructiveHint: true`, because `remove` deletes.

`update_holdings` SHALL enforce the same holding-kind rules as REST (a `crypto` account accepts `crypto` holdings only), and its description and input schema SHALL list the five kinds, the `name` and `unit` fields for `other`, and that `stock`, `etf` and `other` require a manual unit price.

`create_account` and `update_account` SHALL accept the `crypto` account type. No other holdings tool SHALL be added.

#### Scenario: Read via MCP
- **WHEN** a read credential calls `list_holdings` for its own account
- **THEN** quantities, valuations and the aggregate equal the REST response

#### Scenario: Partial update via MCP
- **WHEN** `update_holdings` upserts one holding on an account with three holdings
- **THEN** only that holding changes, and the other two are untouched

#### Scenario: Kind rule via MCP
- **WHEN** `update_holdings` creates a `stock` holding in a `crypto` account
- **THEN** the result is a validation error and nothing changes

#### Scenario: Read credential cannot write
- **WHEN** a read-only credential lists tools
- **THEN** `update_holdings` is not returned

#### Scenario: Cross-user account
- **WHEN** a credential calls either tool with another user's account id
- **THEN** the result is a not-found error
