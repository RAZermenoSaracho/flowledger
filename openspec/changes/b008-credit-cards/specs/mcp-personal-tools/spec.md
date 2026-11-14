# Spec Delta

## ADDED Requirements

### Requirement: Credit-card billing tool
The MCP server SHALL register `get_credit_card` (`readOnlyHint: true`) for every credential.

The tool takes an account id and an optional page. It SHALL return the same billing data as `GET /accounts/:id/credit-card`, with the same validation, ownership and errors.

`create_account` and `update_account` SHALL accept the credit-card configuration fields, and `create_transaction` and `update_transaction` SHALL accept `creditCardKind`, all under the shared schemas. No other credit-card tool SHALL be added.

#### Scenario: Billing via MCP
- **WHEN** a read credential calls `get_credit_card` for its own card
- **THEN** debt, available credit and every period's figures equal the REST response

#### Scenario: Payment through MCP
- **WHEN** `create_transaction` creates a 6000 transfer from a debit account into a card
- **THEN** `get_credit_card` shows it as a payment, exactly as a web-created transfer

#### Scenario: Cross-user card
- **WHEN** a credential calls `get_credit_card` with another user's account id
- **THEN** the result is a not-found error
