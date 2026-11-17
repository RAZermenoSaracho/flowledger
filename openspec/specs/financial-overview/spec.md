# financial-overview Specification

## Purpose
Read-only Profile "Financial overview" metrics that count only accepted shared-expense shares, with pending shares disclosed separately.

## Requirements

### Requirement: Financial overview endpoint
The API SHALL expose `GET /reports/financial-overview` that requires authentication, accepts an optional IANA `timeZone`, and returns the resolved currency, the net worth and the savings rate. All calculation SHALL happen in the API, and only the signed-in user's data SHALL be included. The currency SHALL be the user's preferred currency, falling back to USD as reports do, and SHALL be included in the response. A failure in one metric SHALL NOT fail the other.

#### Scenario: Unauthenticated request
- **WHEN** a request without a valid access token calls the endpoint
- **THEN** it is rejected as unauthorized

#### Scenario: Only own data
- **WHEN** two users have accounts, debts and transactions
- **THEN** each user's response reflects only their own records

#### Scenario: No preferred currency
- **WHEN** the user has no preferred currency
- **THEN** figures are in USD and the response states USD

#### Scenario: One metric fails
- **WHEN** the savings rate cannot be computed because of an error
- **THEN** the net worth is still returned

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

### Requirement: Monthly savings rate
The savings rate SHALL be (net income - net expenses) / net income x 100 for the last complete calendar month in the user's local time zone, shown as a percentage with the month named and labeled as based on recorded transactions. Net income SHALL be FlowLedger's existing report value, which excludes reimbursement offsets. Transfers SHALL be excluded, card purchases SHALL count on their purchase date, shared expenses SHALL count at the full amount until settled, and a settlement with an offset category SHALL reduce net expenses in the month it is approved. Pending imported transactions SHALL NOT count until reviewed.

#### Scenario: Positive rate
- **WHEN** last month has net income 1000 and net expenses 750
- **THEN** the rate is 25% for that named month

#### Scenario: Expenses above income
- **WHEN** net expenses exceed net income
- **THEN** a negative rate is shown

#### Scenario: Zero or negative income
- **WHEN** net income is zero or negative
- **THEN** the rate is unavailable, not zero or infinity

#### Scenario: No data
- **WHEN** the month has no income or expense transactions
- **THEN** the metric shows "not enough data"

#### Scenario: Transfers and pending imports
- **WHEN** the month contains transfers and pending imported transactions
- **THEN** neither changes the rate

#### Scenario: Local calendar
- **WHEN** a transaction falls in a different month in the user's time zone than in UTC
- **THEN** it is counted in the user's local month, using the supplied `timeZone`

#### Scenario: Missing rate
- **WHEN** a rate needed for the month is missing
- **THEN** the savings rate is unavailable, and net worth and the rest of Profile are unaffected

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

### Requirement: Financial overview section on Profile
The Profile General tab SHALL show a compact, read-only "Financial overview" section with both metrics, their units, the time period and the "estimate" or "recorded" label. It SHALL be usable at mobile width and in light and dark themes, show the preferred currency, and fail independently of the rest of Profile. The section SHALL be added as a child of the General tab and SHALL NOT depend on profile form state.

#### Scenario: Both metrics shown
- **WHEN** the data loads
- **THEN** net worth with components and the savings rate with its month are visible with their labels

#### Scenario: Section error
- **WHEN** the request fails
- **THEN** the section shows an error and the rest of Profile still works

#### Scenario: Narrow viewport and dark theme
- **WHEN** viewed at mobile width, in either theme
- **THEN** content is readable without horizontal scroll
