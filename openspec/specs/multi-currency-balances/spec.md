# multi-currency-balances Specification

## Purpose
Defines how FlowLedger keeps each account's balance correct in its own currency. It also defines how a cross-currency transaction, transfer or settlement records what was actually applied to each account.

## Requirements

### Requirement: Persisted native applied amounts

Every transaction with an account SHALL persist `accountAmount`, the amount applied to that account in the account's currency. Every transfer SHALL also persist `destinationAmount`, the amount credited to the destination account in that account's currency.

When the execution currency equals the target account's currency, the applied amount SHALL equal `amount` exactly, and a stated value that differs SHALL be rejected with 400. This SHALL hold for every write path: web create and edit, `/v1`, MCP, provider import, and settlement request and approval.

#### Scenario: Cross-currency transfer

- **WHEN** a user transfers `amount` "100" USD from a USD account to an MXN account with `destinationAmount` "1712.50"
- **THEN** the USD account's balance decreases by exactly 100 and the MXN account's balance increases by exactly 1712.50

#### Scenario: Same-currency transfer

- **WHEN** a user transfers "100" MXN between two MXN accounts without `destinationAmount`
- **THEN** both applied amounts are "100", and the balances change exactly as a same-currency transfer did before this change

#### Scenario: Expense in another currency

- **WHEN** a user records a "20" USD expense on an MXN account with `accountAmount` "342.10"
- **THEN** the MXN account's balance decreases by 342.10

### Requirement: Executed amounts are stated, never derived from current rates

When the currencies differ and the request omits the required `accountAmount` or `destinationAmount`, the server SHALL reject the write with 400 naming the missing field. The server SHALL NOT derive an executed amount from a current exchange rate on any path. This includes settlement approval into an account whose currency differs from the debt's currency.

Current rates SHALL only be offered as editable suggestions, through the existing rate lookup (`GET /currencies/rate`, `/v1/currencies/rate`, MCP `get_exchange_rate`). An update that changes the amount, the currency, the type or an account of a cross-currency transaction SHALL also restate the affected applied amounts.

#### Scenario: Omitted received amount

- **WHEN** an API client creates a USD to MXN transfer without `destinationAmount`
- **THEN** the request fails with 400 naming `destinationAmount` and nothing is stored

#### Scenario: Cross-currency settlement

- **WHEN** a creditor approves a USD settlement into an MXN account without `accountAmount`
- **THEN** the approval fails with 400 naming `accountAmount`

#### Scenario: Cross-currency import

- **WHEN** an imported provider row's currency differs from its linked account's currency and no `accountAmount` is given
- **THEN** the import fails with 400 naming `accountAmount`

### Requirement: Balances use only persisted native amounts

An account's balance SHALL be computed as follows, using exact decimal arithmetic:
- start from its `initialBalance`;
- add the `accountAmount` of income;
- subtract the `accountAmount` of expenses and outgoing transfers;
- add the `destinationAmount` of incoming transfers.

Every balance consumer SHALL use this one calculation, including the accounts list and the financial overview. Valuations in another currency SHALL convert the native balance at a current rate. A rate change SHALL NOT alter any native balance or any recorded execution detail.

#### Scenario: Rate moves

- **WHEN** the USD to MXN rate changes after a transfer was recorded
- **THEN** both accounts' native balances and the transfer's recorded amounts are unchanged, and only the preferred-currency valuation changes

### Requirement: Execution details

A transaction MAY record `feeAmount` with `feeCurrency`, only when the fee is explicitly known. The two SHALL be given together or not at all. `feeCurrency` SHALL be the source amount's currency or the destination account's currency.

A fee SHALL be audit detail only. The applied amounts already include its effect, and it SHALL NOT be subtracted again from any balance or reported as a separate expense. The execution time SHALL be the transaction's `date`.

The system SHALL present an effective rate derived from the persisted amounts, labeled "effective". When a fee is recorded, it SHALL also present the rate before the fee, derived from the amounts and the fee.

#### Scenario: Net-only amount

- **WHEN** a transfer records "100" USD sent and "1700" MXN received with no fee
- **THEN** the record shows no fee and an effective rate of 17

#### Scenario: Explicit fee

- **WHEN** a transfer records "100" USD sent, "1666" MXN received and a fee of "2" USD
- **THEN** the source decreases by 100 USD, the destination increases by 1666 MXN, the effective rate is 16.66, and the rate before fee is 17

#### Scenario: Invalid fee

- **WHEN** a request sets `feeAmount` without `feeCurrency`, or in a third currency
- **THEN** it fails with 400

### Requirement: Account currency is fixed once used

An account's currency SHALL NOT change while any transaction references it as `accountId` or `transferToAccountId`. Such a request SHALL return 400 naming the `currency` field.

#### Scenario: Change currency with transactions

- **WHEN** a user changes the currency of an account that has transactions
- **THEN** the request fails with 400 and the account is unchanged

### Requirement: Cross-currency forms and record display

The transaction view and the new-draft view SHALL show an amount field whenever currencies differ:
- an income or expense whose currency differs from its account's SHALL show "Amount in account currency";
- a transfer whose destination currency differs from the source amount's currency SHALL show "Amount received".

The settlement request and approval forms SHALL show "Amount in account currency" when the chosen account's currency differs from the debt's currency.

Each such field SHALL be prefilled with the current-rate suggestion, editable, and required. An optional fee (amount and currency) SHALL be available on transactions.

A saved cross-currency record SHALL show:
- source amount and currency;
- the applied or destination amount and its currency;
- the execution time;
- the effective rate;
- any fee, with the rate before fee.

#### Scenario: Override the suggestion

- **WHEN** the user creates a USD to MXN transfer and replaces the suggested received amount with "1690"
- **THEN** "1690" is saved as `destinationAmount`

#### Scenario: Same currency

- **WHEN** source and destination share a currency
- **THEN** no received-amount or fee field is shown
