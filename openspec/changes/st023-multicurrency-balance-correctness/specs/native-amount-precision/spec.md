## Purpose

Defines how native amounts keep every digit across API, MCP and web. Fiat amounts respect each currency's minor units, and other currencies such as crypto are exact to 18 decimal places.

## ADDED Requirements

### Requirement: Exact native amount storage and arithmetic

Native amounts SHALL be stored with 18 decimal places and up to 12 integer digits, and SHALL be summed with exact decimal arithmetic. Native amounts are `Account.initialBalance`, `Transaction.amount`, `accountAmount`, `destinationAmount` and `feeAmount`. Preferred-currency valuations, shared-expense amounts and settlement amounts SHALL keep their existing two-decimal storage.

#### Scenario: Crypto round trip

- **WHEN** a user creates a transaction of "1.234567890123456789" BTC on a BTC account, reads it back, and reads the account's balance
- **THEN** the stored amount, the returned amount, the balance contribution and the displayed amount all show `1.234567890123456789`

### Requirement: Decimal-string contract

Requests on the web API, `/v1` and MCP SHALL send native amounts as decimal strings without exponent (for example `"1.234567890123456789"`). A JSON number, an exponent or a non-numeric string SHALL be rejected with 400 naming the field.

Responses SHALL return native amounts and native balances as decimal strings without exponent. These are `amount`, `accountAmount`, `destinationAmount`, `feeAmount`, `initialBalance` and `currentBalance`. Preferred-currency valuations, report totals and debt figures SHALL remain JSON numbers. The public API documentation and the MCP tool descriptions SHALL describe this breaking contract.

#### Scenario: String in, string out

- **WHEN** a `/v1` client posts `amount: "0.000000000000000001"` in `ETH`
- **THEN** the transaction is created and `GET /v1/transactions/:id` returns `amount: "0.000000000000000001"`

#### Scenario: Number rejected

- **WHEN** an MCP client sends `amount: 4.5`
- **THEN** the call fails with a validation error naming `amount` and nothing is stored

### Requirement: Precision limits by currency, never rounded

For an ISO 4217 currency, an amount SHALL have at most that currency's minor units: 2 for USD and MXN, 0 for JPY, 3 for KWD. For any other currency, it SHALL have at most 18 decimal places. Every amount SHALL have at most 12 integer digits. An amount outside these limits SHALL be rejected with 400 naming the field, and SHALL NOT be rounded.

#### Scenario: Nineteen decimals

- **WHEN** a request sends "1.0000000000000000001" BTC
- **THEN** the request fails with 400 naming `amount` and nothing is stored

#### Scenario: Fiat precision

- **WHEN** a request sends "10.005" USD
- **THEN** the request fails with 400 naming `amount`

#### Scenario: Zero-decimal fiat

- **WHEN** a request sends "1500" JPY
- **THEN** it is accepted, and "1500.5" JPY is rejected

### Requirement: Shareable currencies only

Sharing a transaction SHALL be rejected with 400 and the message "Sharing is only supported for fiat currencies with up to 2 decimals" when its execution currency or its account's currency is not an ISO 4217 currency with at most 2 minor units. This covers creating, converting and updating a shared expense. Requesting or approving a settlement whose debt or account is in such a currency SHALL be rejected the same way. These rules SHALL hold on the web API, `/v1` and MCP.

#### Scenario: Share a BTC expense

- **WHEN** an owner enables sharing on an expense recorded in BTC
- **THEN** the request fails with 400 and no shared expense is created
