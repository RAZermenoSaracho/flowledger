# Spec Delta

## MODIFIED Requirements

### Requirement: Estimated net worth
Net worth SHALL equal the values of active accounts, plus what people owe the user, minus what the user owes people, converted to the preferred currency, and SHALL be returned with its three components.

**Account values:**
- The value of an `investment` or `crypto` account SHALL be its holdings aggregate value, as defined by `account-holdings`, which is 0 when it has no holdings.
- Every other account type SHALL contribute its transaction-derived balance, unchanged.
- Net worth SHALL use the same holdings valuation the account endpoints return. There SHALL be one net-worth calculation.
- An `investment` or `crypto` account SHALL never contribute its transaction-derived balance.
- A missing holding SHALL be excluded and named as "<account name> · <code>", and the net worth SHALL then be partial. It SHALL never be counted as zero.

**Debts:**
- Receivables and payables SHALL count only shared-expense shares in the `accepted` state (defined by `st003-convert-transaction-to-shared`).
- `proposed` and `rejected` shares SHALL be excluded, and the number of `proposed` shares SHALL be disclosed as "N awaiting acceptance (not counted)".

**Other rules:**
- Net worth SHALL be labeled as an estimate based on recorded balances and valuations.
- Archived accounts SHALL be excluded.
- Credit-card debt SHALL reduce it, and an overpaid card SHALL increase it.

#### Scenario: Components and total
- **WHEN** the user has a 1000 account, 200 owed to them and 50 owed by them
- **THEN** the total is 1150 and the three components are shown

#### Scenario: Credit card
- **WHEN** a credit card account has a negative balance, or is overpaid
- **THEN** the negative balance reduces net worth and the overpayment increases it

#### Scenario: Same-currency transfer
- **WHEN** the user transfers money between two of their accounts in the same currency
- **THEN** net worth is unchanged

#### Scenario: Debt settlement
- **WHEN** a debt is settled
- **THEN** net worth is unchanged apart from exchange-rate differences

#### Scenario: Only accepted shares count
- **WHEN** the user has an `accepted` share owed to them of 200, a `proposed` share of 100 and a `rejected` share of 50
- **THEN** only the 200 enters receivables, and the same rule applies to what the user owes

#### Scenario: Awaiting acceptance disclosed
- **WHEN** one or more shares are `proposed`
- **THEN** net worth shows "N awaiting acceptance (not counted)" with N the number of proposed shares, and nothing is shown when N is zero

#### Scenario: Archived account
- **WHEN** an archived account exists
- **THEN** it is excluded, and if its balance is non-zero the section says an excluded account has a balance

#### Scenario: Missing rate
- **WHEN** an account or debt cannot be converted because its rate is missing
- **THEN** it is excluded and named, the net worth is shown as partial, and the request does not fail

#### Scenario: Holdings replace the recorded balance
- **WHEN** the user's checking account has 4000 and their `crypto` account has a ledger balance of 1000 and holdings valued at 850
- **THEN** the accounts component is 4850, not 5850 or 5000

#### Scenario: Transfer into a holdings account
- **WHEN** the user transfers 500 from checking into an account with holdings and has not updated the holdings
- **THEN** net worth falls by 500 until the user records the holdings, and the 500 is never counted from the ledger

#### Scenario: Account without holdings counts zero
- **WHEN** an `investment` account has no holdings and a ledger balance of 1000
- **THEN** it contributes 0 to net worth

#### Scenario: Missing holding is not zero
- **WHEN** one holding of an account has no available value
- **THEN** that holding is named in the excluded list, net worth is partial, and the known subtotal of the account's other holdings still counts

#### Scenario: Unaffected account types
- **WHEN** a user has only bank, cash and credit-card accounts
- **THEN** net worth, its components and its disclosures are identical to the previous behavior

#### Scenario: Matches the account endpoint
- **WHEN** an account with holdings is in the preferred currency
- **THEN** its contribution to net worth equals the `value` returned by `GET /accounts/:id/holdings`

#### Scenario: Contributions never affect net worth
- **WHEN** an investment or crypto account has transfers in or out that produce net contributions
- **THEN** net worth counts only the account's `holdingsValuation.value`, and the net contributions do not change it

### Requirement: Disclosures
The overview SHALL disclose the following, only when they apply, and grouped in one place:
- past-month amounts in other currencies are converted at current rates;
- active `investment` or `crypto` accounts without holdings count as zero until holdings are added (`investment_without_holdings`, which replaces `investment_recorded_balance`; the old code stays in the shared enum but SHALL no longer be emitted);
- one or more counted crypto holdings use Binance USDT quotations converted as USDT = USD (`crypto_usdt_as_usd`);
- synced accounts' balances come from recorded transactions and may differ from the bank;
- the savings rate depends on how transactions were recorded, for example a card payment recorded as an expense counts twice.

Cross-currency transfers and transactions in a currency other than their account's SHALL NOT produce a disclosure, because balances use persisted native amounts.

#### Scenario: Nothing applies
- **WHEN** none of the conditions hold
- **THEN** no disclosure list is shown

#### Scenario: Investment account
- **WHEN** the user has an active `investment` or `crypto` account without holdings
- **THEN** net worth discloses `investment_without_holdings` ("Investment and crypto accounts without holdings count as zero until you add holdings."), and never `investment_recorded_balance`

#### Scenario: Every holding account has holdings
- **WHEN** every active `investment` and `crypto` account has holdings
- **THEN** the without-holdings disclosure is not shown

#### Scenario: Old valuation
- **WHEN** a counted holding was last valued a year ago
- **THEN** it counts at that value and no age-based disclosure is shown

#### Scenario: Market-priced crypto
- **WHEN** a counted holding is market-priced
- **THEN** net worth discloses that crypto quotations are in USDT and converted as USDT = USD

#### Scenario: Synced account
- **WHEN** the user has a synced account
- **THEN** net worth discloses that balances may differ from the bank

#### Scenario: Cross-currency
- **WHEN** a cross-currency transfer or a transaction in a currency other than its account's exists
- **THEN** no cross-currency disclosure is shown

#### Scenario: Past month in another currency
- **WHEN** last month includes amounts in a currency other than the preferred one
- **THEN** the savings rate discloses conversion at current rates
