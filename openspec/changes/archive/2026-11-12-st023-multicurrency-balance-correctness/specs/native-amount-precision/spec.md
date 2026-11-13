## Purpose

Defines how native amounts keep every digit across API, MCP and web. Fiat amounts respect each currency's minor units, and other currencies such as crypto are exact to 18 decimal places.

## ADDED Requirements

### Requirement: Exact native amount storage and arithmetic

Native amounts SHALL be stored with 18 decimal places and up to 20 integer digits (`Decimal(38,18)`), and SHALL be summed with exact decimal arithmetic. Every money and rate column SHALL use this type: `Account.initialBalance`; `Transaction.amount`, `accountAmount`, `destinationAmount`, `feeAmount`, `amountInPreferredCurrency` and `exchangeRate`; `SharedExpense.totalAmount`; `SharedExpenseParticipant.shareAmount` and `paidAmount`; `SettlementRequest.amount` and `debtorAccountAmount`; `ProviderImportedTransaction.amount`. The API SHALL use `Prisma.Decimal` configured once with precision 50 and round half up, and the web app SHALL use one BigInt minor-unit module. No money arithmetic SHALL use floats.

#### Scenario: Crypto round trip

- **WHEN** a user creates a transaction of "1.234567890123456789" BTC on a BTC account, reads it back, and reads the account's balance
- **THEN** the stored amount, the returned amount, the balance contribution and the displayed amount all show `1.234567890123456789`

### Requirement: Decimal-string contract

Requests on the web API, `/v1` and MCP SHALL send native amounts as decimal strings without exponent (for example `"1.234567890123456789"`). A JSON number, an exponent or a non-numeric string SHALL be rejected with 400 naming the field.

Responses SHALL return native amounts and native balances as decimal strings without exponent. These are `amount`, `accountAmount`, `destinationAmount`, `feeAmount`, `initialBalance`, `currentBalance`, `shareAmount`, `paidAmount`, `totalAmount` and `outstandingAmount`. Preferred-currency valuations and report totals SHALL remain JSON numbers. The public API documentation and the MCP tool descriptions SHALL describe this breaking contract.

#### Scenario: String in, string out

- **WHEN** a `/v1` client posts `amount: "0.000000000000000001"` in `ETH`
- **THEN** the transaction is created and `GET /v1/transactions/:id` returns `amount: "0.000000000000000001"`

#### Scenario: Number rejected

- **WHEN** an MCP client sends `amount: 4.5`
- **THEN** the call fails with a validation error naming `amount` and nothing is stored

### Requirement: Precision limits by currency, never rounded

For an ISO 4217 currency, an amount SHALL have at most that currency's minor units: 2 for USD and MXN, 0 for JPY, 3 for KWD. For any other currency, it SHALL have at most 18 decimal places. Every amount SHALL have at most 20 integer digits. An amount outside these limits SHALL be rejected with 400 naming the field, and SHALL NOT be rounded.

#### Scenario: Nineteen decimals

- **WHEN** a request sends "1.0000000000000000001" BTC
- **THEN** the request fails with 400 naming `amount` and nothing is stored

#### Scenario: Fiat precision

- **WHEN** a request sends "10.005" USD
- **THEN** the request fails with 400 naming `amount`

#### Scenario: Zero-decimal fiat

- **WHEN** a request sends "1500" JPY
- **THEN** it is accepted, and "1500.5" JPY is rejected

### Requirement: Sharing and settlement for every currency

Sharing a transaction, requesting a settlement and approving one SHALL work for every currency, crypto included, on the web API, `/v1` and MCP. Shared amounts SHALL keep the transaction's currency, and share, paid, total and outstanding amounts SHALL be decimal strings. Notifications SHALL show the exact amount with its currency code.

#### Scenario: Share a BTC expense

- **WHEN** an owner shares an expense recorded in BTC
- **THEN** the shared expense is created in BTC with exact amounts

#### Scenario: Settle in ETH

- **WHEN** a debtor settles a share of "1" ETH
- **THEN** the settlement request, approval, resulting transactions and notification all show exactly `1 ETH`

### Requirement: Exact, deterministic splits

Input SHALL never be rounded. An equal split SHALL use largest-remainder allocation on integer minor units of the currency (its ISO minor units, else 18): each participant gets `floor(units / n)`, and the remaining units go one each, in stable order, owner first and then list order. Shares SHALL sum exactly to the amount, and the owner share SHALL equal the amount minus the sum of participant shares. Valuations into the preferred currency SHALL round half up to that currency's digits.

#### Scenario: Fiat remainder

- **WHEN** "100.00" MXN is split among 3
- **THEN** the shares are 33.34, 33.33 and 33.33 for the owner and the two participants in order

#### Scenario: Crypto remainder

- **WHEN** "0.01" BTC is split among 3
- **THEN** the shares are 0.003333333333333334, 0.003333333333333333 and 0.003333333333333333

#### Scenario: Accumulated precision

- **WHEN** 100 is added to "1.234567890123456789"
- **THEN** the sum is exactly `101.234567890123456789`
