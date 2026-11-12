## Purpose

Defines how FlowLedger keeps each account's balance correct in its own currency. It also defines how a cross-currency transaction or transfer records what was actually applied to each account.

## ADDED Requirements

### Requirement: Persisted native applied amounts

Every transaction with an account SHALL persist `accountAmount`, the amount applied to that account in the account's currency. Every transfer SHALL also persist `destinationAmount`, the amount credited to the destination account in that account's currency. When the execution currency equals the account's currency, the applied amount SHALL equal `amount` exactly. This rule SHALL hold for every write path: web create and edit, `/v1`, MCP, provider import, and settlement approval.

#### Scenario: Cross-currency transfer

- **WHEN** a user transfers `amount` 100 USD from a USD account to an MXN account and states `destinationAmount` 1712.50
- **THEN** the USD account's balance decreases by exactly 100 and the MXN account's balance increases by exactly 1712.50

#### Scenario: Same-currency transfer

- **WHEN** a user transfers 100 MXN between two MXN accounts without stating `destinationAmount`
- **THEN** both applied amounts are 100 and the balances change exactly as before this change

#### Scenario: Expense in another currency

- **WHEN** a user records a 20 USD expense on an MXN account with `accountAmount` 342.10
- **THEN** the MXN account's balance decreases by 342.10

#### Scenario: Every write path

- **WHEN** a cross-currency transaction is created through MCP, `/v1`, provider import, or settlement approval
- **THEN** the stored `accountAmount`, and `destinationAmount` for a transfer, follow the same rules as the web API

### Requirement: Suggested applied amounts

When the currencies differ and the request omits `accountAmount` or `destinationAmount`, the server SHALL suggest the missing amount at the current exchange rate, rounded to the target currency's precision, and persist it. The response SHALL return the persisted value. A stated amount SHALL always take precedence over a suggestion. If no rate is available, the server SHALL reject the write with 400 and name the missing field.

#### Scenario: Omitted received amount

- **WHEN** an API client creates a USD to MXN transfer without `destinationAmount`
- **THEN** the server persists `destinationAmount` at the current USD to MXN rate and returns it

#### Scenario: Rate unavailable

- **WHEN** no rate exists between the two currencies and `destinationAmount` is omitted
- **THEN** the request fails with 400 naming `destinationAmount`

### Requirement: Balances use only persisted native amounts

An account's balance SHALL equal its `initialBalance`, plus the `accountAmount` of income, minus the `accountAmount` of expenses and outgoing transfers, plus the `destinationAmount` of incoming transfers. The sum SHALL use exact decimal arithmetic. Every balance consumer SHALL use this one calculation, including the accounts list and the financial overview. Valuations in another currency SHALL be computed from this native balance at a current rate. A rate change SHALL NOT alter any native balance or recorded execution detail.

#### Scenario: Rate moves

- **WHEN** the USD to MXN rate changes after a transfer was recorded
- **THEN** both accounts' native balances and the transfer's recorded amounts are unchanged, and only the preferred-currency valuation changes

### Requirement: Execution details

A transaction MAY record `feeAmount` with `feeCurrency`, only when the fee is explicitly known. The two SHALL be given together or not at all. It MAY record `appliedRate`, the stated rate. A fee SHALL be audit detail only: the applied amounts already include its effect, and it SHALL NOT be subtracted again from any balance. When `appliedRate` is absent, the system SHALL present an effective rate derived from the persisted amounts and label it "effective". The execution time SHALL be the transaction's `date`.

#### Scenario: Net-only amount

- **WHEN** a transfer records 100 USD sent and 1700 MXN received with no fee or rate
- **THEN** the record shows no fee and an effective rate of 17 labeled "effective"

#### Scenario: Explicit fee

- **WHEN** a transfer records 100 USD sent, 1666 MXN received, fee 2 USD and rate 17
- **THEN** the source decreases by 100 USD, the destination increases by 1666 MXN, and the fee appears only as a detail

#### Scenario: Fee without currency

- **WHEN** a request sets `feeAmount` without `feeCurrency`
- **THEN** it fails with 400

### Requirement: Account currency is fixed once used

An account's currency SHALL NOT change while any transaction references it as `accountId` or `transferToAccountId`. Such a request SHALL return 400 with a message naming the `currency` field.

#### Scenario: Change currency with transactions

- **WHEN** a user changes the currency of an account that has transactions
- **THEN** the request fails with 400 and the account is unchanged

### Requirement: Cross-currency form and record display

The transaction view and the new-draft view SHALL behave as follows when currencies differ:
- For an income or expense whose currency differs from its account's, they SHALL show "Amount in account currency".
- For a transfer whose destination currency differs from the source amount's currency, they SHALL show "Amount received".
- Each such field SHALL be prefilled with the current-rate suggestion and SHALL be editable.
- Optional fee (amount and currency) and stated-rate fields SHALL be available.

A saved cross-currency record SHALL show:
- source amount and currency
- destination or applied amount and currency
- execution time
- the stated or effective rate
- any fee

Fields that do not apply SHALL stay hidden.

#### Scenario: Override the suggestion

- **WHEN** the user creates a USD to MXN transfer and replaces the suggested received amount with 1690
- **THEN** 1690 is saved as `destinationAmount`

#### Scenario: Same currency

- **WHEN** source and destination share a currency
- **THEN** no received-amount, fee or rate field is shown
