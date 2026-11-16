# Spec Delta

## Purpose

Lets users keep several manually maintained positions in their investment and crypto accounts. Each position records an exact quantity and a valuation. An account's value is the sum of its positions, and that sum replaces the transaction-derived balance in net worth, so nothing is counted twice.

## ADDED Requirements

### Requirement: Eligible accounts and the crypto account type

`AccountType` SHALL include `crypto`, with a readable label wherever account types are shown or chosen.

Holdings SHALL be allowed only on accounts of type `investment` or `crypto`. Creating a holding on any other account type SHALL be rejected with a validation error.

Changing an account that has holdings to a non-eligible type SHALL be rejected, with a message saying the holdings must be removed first.

Deleting an account SHALL delete its holdings. Archiving an account SHALL keep them.

#### Scenario: Holding on a checking account
- **WHEN** a user adds a holding to their `checking` account
- **THEN** the request is rejected with a validation error and nothing is stored

#### Scenario: Type change with holdings
- **WHEN** a user changes an `investment` account that has two holdings to `savings`
- **THEN** the update is rejected, and the type and holdings are unchanged

#### Scenario: Delete cascades
- **WHEN** a user deletes a `crypto` account with holdings
- **THEN** its holdings no longer exist

### Requirement: Holding identity and quantity

**Identity:**
- A holding SHALL belong to exactly one account.
- It SHALL identify its instrument by a stable identity: `kind` plus an upper-case `code`.
- `kind` SHALL be `fiat` for uninvested cash or `crypto` for crypto assets.
  - A `fiat` code SHALL be an ISO 4217 currency.
  - A `crypto` code SHALL be a 2–10 character asset code. It does not have to be listed by any price source.
- Fiat cash holdings SHALL be distinguishable from every other instrument in all responses and in the UI.

**Uniqueness:**
- An account SHALL hold each `(kind, code)` at most once.
- The same instrument MAY be held in any number of other accounts, each with its own quantity.

**Quantity:**
- `quantity` SHALL be a positive exact decimal string.
- A `crypto` quantity SHALL have at most 18 fraction digits.
- A `fiat` quantity SHALL have no more fraction digits than that currency's minor units.
- Excess precision SHALL be rejected, never rounded.
- Quantities SHALL be stored, returned, displayed and used in valuation without changing a digit.

No transaction SHALL be created or required to buy, sell or rebalance holdings.

#### Scenario: Same instrument in two accounts
- **WHEN** a user holds 0.5 BTC in account A and 0.25 BTC in account B
- **THEN** both holdings exist independently, and editing one leaves the other unchanged

#### Scenario: Duplicate in one account
- **WHEN** a change set would create a second BTC `crypto` holding in an account that already holds one
- **THEN** the whole change set is rejected and nothing changes

#### Scenario: Exact quantity
- **WHEN** a user saves a quantity of 1.234567890123456789 ETH
- **THEN** the API returns exactly "1.234567890123456789", and the web app displays every digit

#### Scenario: Excess precision
- **WHEN** a user saves 10.005 as a USD `fiat` quantity, or a crypto quantity with 19 decimals
- **THEN** the request is rejected and nothing is rounded

### Requirement: Manual valuation override

A `crypto` holding MAY carry a manual valuation, made of:
- a positive exact decimal unit price;
- the price's currency, which can be any supported fiat or crypto code, is stored as entered, and is never assumed to be USD;
- the time of that valuation.

**Valuation time:**
- It SHALL default to the time of the change. It MAY be supplied, but it SHALL NOT be in the future.
- It SHALL be updated whenever the unit price or its currency changes.
- It SHALL NOT change when only the quantity changes.

**Setting and clearing:**
- Setting a manual unit price is the explicit override.
- Clearing it SHALL remove the override and its timestamp.

`fiat` holdings SHALL NOT accept a manual unit price.

#### Scenario: Override labeled
- **WHEN** a user sets a manual unit price of 61000 USD on a BTC holding
- **THEN** the holding is valued from that price, its source is `manual`, and the UI labels it "Manual"

#### Scenario: Quantity edit keeps the valuation time
- **WHEN** a user changes only the quantity of a manually valued holding
- **THEN** its valuation time is unchanged

#### Scenario: Fiat manual price
- **WHEN** a change set sets a manual unit price on a `fiat` holding
- **THEN** the change set is rejected

### Requirement: Valuation precedence, currency and missing values

Each holding's valuation SHALL be resolved in this order:
1. **`fiat`:** the quantity at par in its own currency (source `cash`).
2. **Manual override:** the manual unit price (source `manual`).
3. **`crypto` with no override:** an available market quotation, as defined by `crypto-holding-prices` (source `market`).
4. **Otherwise:** missing.

**What each holding SHALL report:**
- its source, unit price and price currency, in the currency of the original quotation or the manual entry;
- its valuation time, as defined by `valuation-timestamps`;
- its value in the account currency, converted at the current rate through the application's existing currency conversion.

**Missing values:**
- A missing holding SHALL report a `null` value and one reason: `unsupported`, `price_unavailable` or `rate_unavailable`.
- A missing value SHALL never be reported, summed or displayed as zero.

**Time does not invalidate a known value:**
- Elapsed time alone SHALL NEVER change a known valuation into a missing one.
- Elapsed time SHALL NEVER flag a known valuation or change its status.

#### Scenario: Missing is not zero
- **WHEN** a crypto holding has an unsupported code and no manual price
- **THEN** its value is `null` with reason `unsupported`, it shows "Value missing", and it adds nothing to the aggregate

#### Scenario: Old manual price stays known
- **WHEN** a manual price was set 400 days ago and never replaced
- **THEN** the holding is valued from it with no warning or flag, and its valuation time shows that date

#### Scenario: Conversion into the account currency
- **WHEN** an MXN `investment` account holds 0.5 BTC with a manual price of 60000 USD, and 1 USD = 17 MXN
- **THEN** the holding shows a unit price of 60000 USD and a value of 510000 MXN

#### Scenario: Conversion failure
- **WHEN** the rate from the price currency to the account currency is unavailable
- **THEN** that holding is missing with reason `rate_unavailable`, and the request does not fail

### Requirement: Aggregate account value

For an account with at least one holding, the API SHALL return an aggregate in the account currency containing:
- `value`: the known subtotal, meaning the sum of the non-missing holding values;
- `status`: `complete`, or `partial` when any holding is missing;
- the number of missing holdings, which are also named in the holdings list;
- `netDeposited`: the account's transaction-derived balance.

**Rounding:**
- Each holding's value SHALL be summed exactly, before any rounding.
- The aggregate SHALL be rounded once, to the account currency's minor units.
- A per-holding value SHALL be rounded only for its own display.

**Value versus net deposited:**
- `value` SHALL be the account's value.
- `netDeposited` SHALL be informational and SHALL NEVER be added to `value` or to net worth.
- Deposits, withdrawals and transfers SHALL change `netDeposited`, not `value`.

**Accounts without holdings:**
- They SHALL keep the transaction-derived balance as their value, unchanged.
- `GET /accounts` SHALL include the aggregate as `holdingsValuation` for accounts with holdings, and `null` otherwise.
- Every other existing account field SHALL keep its current meaning.

#### Scenario: Cash plus crypto
- **WHEN** a USD `crypto` account holds 250 USD and 0.01 BTC valued at 60000 USD each, and 1000 USD was transferred in
- **THEN** its value is 850 USD with status `complete`, and its `netDeposited` is 1000

#### Scenario: Deposit does not double count
- **WHEN** the user transfers 500 USD from checking into an account with holdings and has not edited the holdings yet
- **THEN** `netDeposited` rises by 500, the value is unchanged, and the Holdings tab reminds the user to update the cash holding

#### Scenario: Partial aggregate
- **WHEN** an account has one holding valued at 100 and one missing holding
- **THEN** the value is 100 with status `partial`, and the missing holding is named with its reason

#### Scenario: Rounding only at the boundary
- **WHEN** three holdings convert to 0.333…, 0.333… and 0.333… USD
- **THEN** the aggregate is 1.00 USD, not 0.99

#### Scenario: Backward compatibility
- **WHEN** an `investment`, `checking` or `credit_card` account has no holdings
- **THEN** `holdingsValuation` is `null`, and its balance and every existing field behave exactly as before

### Requirement: Holdings API, permissions and atomicity

**Reading:** `GET /accounts/:id/holdings` SHALL return the account's holdings with their valuations and the aggregate.

**Writing:** `PATCH /accounts/:id/holdings` SHALL accept a change set of the form `{ upsert: [...], remove: [ids] }`:
- An `upsert` item without `id` creates a holding.
- An `upsert` item with `id` updates that holding's quantity or manual valuation. `kind` and `code` cannot be changed.
- Holdings not mentioned SHALL be left untouched.
- The change set SHALL be validated with shared schemas and applied atomically: either every change persists or none does.
- The response SHALL be the same body as `GET`.

**Isolation:**
- Every read and write SHALL be scoped to the signed-in user, through the web API, `/v1` and MCP.
- Writes through `/v1` and MCP SHALL require the `write` scope.
- An account or holding id that belongs to another user, or a holding id that belongs to a different account, SHALL produce the standard not-found response. That response SHALL NOT reveal whether the id exists.

#### Scenario: Atomic change set
- **WHEN** a change set updates one holding and also contains one invalid new holding
- **THEN** the response is a validation error and no holding changes

#### Scenario: Cross-user account
- **WHEN** a user requests or patches the holdings of another user's account
- **THEN** the response is 404 and nothing is read or changed

#### Scenario: Holding id from another account
- **WHEN** a change set for account A removes a holding id that belongs to the same user's account B
- **THEN** the response is 404 and both accounts are unchanged
