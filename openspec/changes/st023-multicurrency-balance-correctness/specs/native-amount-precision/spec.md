## Purpose

Defines how native amounts keep every digit across API, MCP and web, with crypto quantities exact to 18 decimal places and fiat behaving as before.

## ADDED Requirements

### Requirement: Exact native amount storage and arithmetic

Native amounts SHALL be stored with 18 decimal places and up to 12 integer digits, and SHALL be summed with exact decimal arithmetic. Native amounts are `Account.initialBalance`, `Transaction.amount`, `accountAmount`, `destinationAmount` and `feeAmount`. `appliedRate` SHALL use the same precision. Preferred-currency valuations, shared-expense amounts and settlement amounts SHALL keep their existing two-decimal storage.

#### Scenario: Crypto round trip

- **WHEN** a user creates a transaction of `1.234567890123456789` BTC on a BTC account, reads it back, and reads the account's balance
- **THEN** the stored amount, the returned amount, the account balance contribution and the displayed amount all show `1.234567890123456789`

### Requirement: Decimal-string contract

Requests SHALL accept native amounts as decimal strings (for example `"1.234567890123456789"`). For compatibility they SHALL also accept JSON numbers. Exponent notation and non-numeric strings SHALL be rejected with 400. Responses from the web API, `/v1` and MCP SHALL return native amounts and native balances as decimal strings with no exponent. These fields are `amount`, `accountAmount`, `destinationAmount`, `feeAmount`, `appliedRate`, `initialBalance` and `currentBalance`. Preferred-currency valuations, report totals and debt figures SHALL remain JSON numbers. The public API documentation SHALL describe this contract.

#### Scenario: String in, string out

- **WHEN** a `/v1` client posts `amount: "0.000000000000000001"` in `ETH`
- **THEN** the transaction is created and `GET /v1/transactions/:id` returns `amount: "0.000000000000000001"`

#### Scenario: Legacy number input

- **WHEN** an MCP client sends `amount: 4.5` in USD
- **THEN** the transaction is created with amount `"4.5"`

### Requirement: Precision limits by currency

For an ISO 4217 (fiat) currency, amounts SHALL be rounded half-up to 2 decimal places, as they are today. For any other currency, amounts with up to 18 decimal places SHALL be accepted unchanged. An amount with more than 18 decimal places SHALL be rejected with 400 naming the field, and SHALL NOT be rounded. Amounts with more than 12 integer digits SHALL be rejected with 400.

#### Scenario: Nineteen decimals

- **WHEN** a request sends `"1.0000000000000000001"` BTC
- **THEN** the request fails with 400 naming `amount` and nothing is stored

#### Scenario: Fiat rounding unchanged

- **WHEN** a request sends `10.005` USD
- **THEN** the stored amount is `10.01`

### Requirement: Crypto sharing and settlement are rejected

Sharing a transaction whose execution currency or account currency is not an ISO 4217 currency SHALL be rejected with 400 and the message "Sharing crypto-denominated transactions is not supported yet". This covers creating, converting and updating a shared expense. Requesting or approving a settlement that would create a transaction in such a currency SHALL be rejected with a similar 400. These rules SHALL hold on the web API, `/v1` and MCP.

#### Scenario: Share a BTC expense

- **WHEN** an owner enables sharing on an expense recorded in BTC
- **THEN** the request fails with 400 and no shared expense is created
