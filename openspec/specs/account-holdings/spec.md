# account-holdings Specification

## Purpose
Lets users keep several manually maintained positions (crypto, cash, stocks, ETFs and other assets) in their investment and crypto accounts. Each position records an exact quantity and a valuation. The value of an investment or crypto account is always the sum of its positions. The transaction-derived balance never counts as that value.

## Requirements

### Requirement: Eligible accounts and the crypto account type

`AccountType` SHALL include `crypto`, with a readable label wherever account types are shown or chosen.

Holdings SHALL be allowed only on accounts of type `investment` or `crypto`. Creating a holding on any other account type SHALL be rejected with a validation error.

Changing an account that has holdings to a non-holding type SHALL be rejected, with a message saying the holdings must be removed first.

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

### Requirement: Holding kinds per account type

`kind` SHALL be one of `crypto`, `fiat` (shown as "Cash"), `stock`, `etf` or `other`.
- `crypto` accounts SHALL accept new holdings of kind `crypto` only.
- `investment` accounts SHALL accept all five kinds.
- A stablecoin such as USDT or USDC SHALL be a `crypto` holding, not cash.
- This SHALL be enforced in the holdings service, so the web API, `/v1` and MCP behave identically. A rejected kind SHALL return a 400 with a field error on `kind`.

**Account type change:**
- Changing an `investment` account to `crypto` SHALL be rejected while it holds any non-crypto holding.
- Changing `crypto` to `investment` SHALL always be allowed.

**Incompatible stored holdings:** a holding already stored in a `crypto` account with a non-crypto kind SHALL be kept, valued and counted, and returned normally.
- Updating it SHALL be rejected with the message "This asset type is not allowed in a crypto account; remove it or change the account type to Investment".
- Removing it SHALL be allowed.
- It SHALL never be deleted or converted automatically.

#### Scenario: Stock in a crypto account
- **WHEN** a change set creates a `stock` holding in a `crypto` account, through any surface
- **THEN** it is rejected with a 400 and a field error on `kind`, and nothing changes

#### Scenario: Stablecoin
- **WHEN** a user adds USDT to a `crypto` account
- **THEN** it is accepted as a `crypto` holding

#### Scenario: Investment accepts every kind
- **WHEN** a user adds crypto, cash, stock, ETF and other holdings to an `investment` account
- **THEN** all five are accepted

#### Scenario: Investment to crypto with cash
- **WHEN** a user changes an `investment` account holding a `fiat` holding to `crypto`
- **THEN** the update is rejected and nothing changes

#### Scenario: Incompatible holding kept
- **WHEN** a `crypto` account already stores a `fiat` holding and the user edits its quantity
- **THEN** the update is rejected with the incompatible-type message, while the holding stays valued, and removing it succeeds

### Requirement: Holding identity and quantity

**Identity:**
- A holding SHALL belong to exactly one account.
- `crypto`, `fiat`, `stock` and `etf` holdings SHALL identify their instrument by `kind` plus an upper-case `code`.
  - A `fiat` code SHALL be an ISO 4217 currency.
  - A `crypto` code SHALL be a 2-10 character alphanumeric asset code that is NOT an ISO 4217 fiat code. It does not have to be listed by any price source.
  - A `stock` or `etf` code SHALL be a ticker matching `^[A-Z0-9][A-Z0-9.-]{0,14}$`.
- A `stock` or `etf` holding MAY additionally identify a specific listing, which makes it provider-linked:
  - `exchange`, the ISO 10383 MIC of the listing (four upper-case alphanumerics, for example `XNGS` or `XMEX`);
  - `quoteCurrency`, the listing's ISO 4217 currency;
  - `name`, the instrument's display name (at most 80 characters).
  `exchange` and `quoteCurrency` SHALL be supplied together, only on creation, and only for `stock` or `etf`. Like `kind` and `code`, they SHALL be immutable afterwards. No securities catalog or instrument table SHALL exist: these fields live on the holding.
- An `other` holding SHALL have a required `name` (at most 80 characters), an optional `unit` (at most 20 characters, for example "oz") and a `null` code. `unit` SHALL NOT be accepted on any other kind.
- Fiat cash holdings SHALL be distinguishable from every other instrument in all responses and in the UI.

**Uniqueness:**
- An account SHALL hold each `(kind, code, exchange)` at most once, and each unlinked `(kind, code)` at most once. An account MAY hold several `other` holdings, because their code is `null`.
- Both rules SHALL be enforced by the database, so they hold under concurrent requests from any number of API processes.
- A change set that would create a holding the account already holds SHALL be rejected with `409` and change nothing, whether an application check or the database detects it. The body SHALL use the structured error format:
  - `message`: "This account already contains a holding for <code>[ (<exchange>)]. Edit the existing holding instead.";
  - `code`: `duplicate_holding`;
  - `holding`: the conflicting `kind`, `code` and `exchange`;
  - `issues.fieldErrors`: keyed `upsert.<index>.code`.
  It SHALL NOT expose SQL, constraint names or stack traces. MCP returns the same message as a tool error.
- The web app SHALL show a duplicate inline under the row that adds it, for manual and search-linked rows alike, and SHALL show a visible notice when Save is blocked by field errors. The user's unsaved rows SHALL be kept; the user can correct the row and save again, or Discard, without reloading.
- `code` and `exchange` SHALL be compared upper-case. A linked and an unlinked holding of the same ticker, or a `stock` and an `etf` with the same code, are different identities.
- The same ticker on different exchanges MAY be held in one account as separate holdings.
- The same instrument MAY be held in any number of other accounts, each with its own quantity.

**Quantity:**
- `quantity` SHALL be a positive exact decimal string.
- A non-fiat quantity SHALL have at most 18 fraction digits.
- A `fiat` quantity SHALL have no more fraction digits than that currency's minor units.
- Excess precision SHALL be rejected, never rounded.
- Quantities SHALL be stored, returned, displayed and used in valuation without changing a digit.

An account SHALL hold at most 200 holdings. No transaction SHALL be created or required to buy, sell or rebalance holdings.

#### Scenario: Same instrument in two accounts
- **WHEN** a user holds 0.5 BTC in account A and 0.25 BTC in account B
- **THEN** both holdings exist independently, and editing one leaves the other unchanged

#### Scenario: Duplicate in one account
- **WHEN** a change set would create a second BTC `crypto` holding in an account that already holds one
- **THEN** the whole change set is rejected and nothing changes

#### Scenario: Same ticker on two exchanges
- **WHEN** an investment account holds AAPL on `XNGS` (USD) and the user adds AAPL on `XMEX` (MXN)
- **THEN** both holdings exist and are shown with their exchange and currency

#### Scenario: Duplicate listing in one account
- **WHEN** a change set would create a second AAPL `stock` on `XNGS` in an account that already holds it
- **THEN** the whole change set is rejected and nothing changes

#### Scenario: Listing fields on other kinds
- **WHEN** a change set sends `exchange` on a `crypto`, `fiat` or `other` holding, or sends `exchange` without `quoteCurrency`
- **THEN** it is rejected

#### Scenario: Fiat code as crypto
- **WHEN** a change set creates a `crypto` holding with code `USD`
- **THEN** it is rejected

#### Scenario: Several other assets
- **WHEN** a user adds "Gold coins" (unit "oz") and "Vintage watch" as `other` holdings in one investment account
- **THEN** both are stored with a `null` code

#### Scenario: Exact quantity
- **WHEN** a user saves a quantity of 1.234567890123456789 ETH
- **THEN** the API returns exactly "1.234567890123456789", and the web app displays every digit

#### Scenario: Excess precision
- **WHEN** a user saves 10.005 as a USD `fiat` quantity, or a crypto quantity with 19 decimals
- **THEN** the request is rejected and nothing is rounded

#### Scenario: Concurrent duplicate creates
- **WHEN** two or more requests create the same BTC `crypto`, USD `fiat` or unlinked AAPL `stock` holding in one account at the same time
- **THEN** exactly one succeeds, every other one is rejected with the duplicate error, and the account holds one such holding

#### Scenario: Duplicate listing in the UI
- **WHEN** an account holds AAPL on `XNGS` and the user picks the same listing from the security search and presses Save
- **THEN** the row shows "This account already contains a holding for AAPL (XNGS). Edit the existing holding instead.", the header shows "Fix the highlighted fields to save", no request is sent, and changing the listing lets the save succeed

#### Scenario: Duplicate detected by the server
- **WHEN** a stale page saves a EUR cash row that another tab has already saved
- **THEN** the API answers `409` `duplicate_holding`, the EUR row shows the message inline, its quantity is kept, and the page leaves the saving state

#### Scenario: Concurrent create and update
- **WHEN** one request edits the quantity of an account's BTC holding while another creates BTC in the same account
- **THEN** the edit is saved, the create is rejected, and the account still holds one BTC holding

#### Scenario: Linked and unlinked ticker
- **WHEN** an account holds AAPL linked to `XNGS` and the user adds AAPL without an exchange
- **THEN** both holdings exist

#### Scenario: Remove and re-add in one change set
- **WHEN** one change set removes the account's BTC holding and creates BTC again
- **THEN** the change set succeeds and the account holds the new BTC holding

### Requirement: Price source and manual valuation

The price source SHALL be derived from the kind, the listing and the manual price, with no stored source column:
- `fiat`: `cash`, valued at par in its own currency. It SHALL NOT accept a manual price and SHALL NOT use Binance.
- `crypto`: `market` through the existing Binance lookup, defined by `crypto-holding-prices`, unless a manual price is set, which makes it `manual`.
- Provider-linked `stock` and `etf`: `market` through the stored provider quote, defined by `security-holding-prices`, unless a manual price is set, which makes it `manual`. A creation MAY omit the manual price.
- Unlinked `stock` and `etf`, and `other`: `manual` only. A creation SHALL require `manualUnitPrice`, and no market price SHALL be looked up.

**Manual valuation:** a positive exact decimal unit price, its currency (any supported fiat or crypto code, stored as entered, never assumed USD) and the time of that valuation.
- The time SHALL default to the time of the change. It MAY be supplied, but SHALL NOT be in the future.
- It SHALL be updated whenever the unit price or its currency changes, and SHALL NOT change when only the quantity changes.
- Clearing the manual price of a `crypto` or provider-linked `stock`/`etf` holding SHALL remove the override and its timestamp, and it SHALL never clear or change the stored market quote.
- Clearing the manual price of a stored unlinked `stock` or `etf`, or of an `other` holding, SHALL be rejected.
- Setting a manual price SHALL never clear the stored market quote, and a market refresh SHALL never change a manual price.
- `unit` SHALL be rejected on a kind other than `other`, and `name` SHALL NOT be set to `null` on an `other` holding.

#### Scenario: Override labeled
- **WHEN** a user sets a manual unit price of 61000 USD on a BTC holding
- **THEN** the holding is valued from that price, its source is `manual`, and the UI labels it "Manual"

#### Scenario: Quantity edit keeps the valuation time
- **WHEN** a user changes only the quantity of a manually valued holding
- **THEN** its valuation time is unchanged

#### Scenario: Fiat manual price
- **WHEN** a change set sets a manual unit price on a `fiat` holding
- **THEN** the change set is rejected

#### Scenario: Stock requires a price
- **WHEN** a change set creates an `etf` holding without an `exchange` and without a manual unit price
- **THEN** the change set is rejected and nothing is stored

#### Scenario: Linked stock without a price
- **WHEN** a change set creates a `stock` holding with `exchange` `XNGS`, `quoteCurrency` USD and no manual unit price
- **THEN** it is stored, and its source is `market`

#### Scenario: Clearing a stock price
- **WHEN** a change set sets `manualUnitPrice` to `null` on a stored unlinked `stock` holding
- **THEN** it is rejected

#### Scenario: Clearing a linked stock price
- **WHEN** a change set sets `manualUnitPrice` to `null` on a provider-linked `stock` holding
- **THEN** the override is removed, the stored market quote is unchanged, and the holding is valued from it with source `market`

### Requirement: Valuation precedence, currency and missing values

Each holding's valuation SHALL be resolved in this order:
1. **`fiat`:** the quantity at par in its own currency (source `cash`), converted through the existing exchange rate.
2. **Manual price:** the manual unit price (source `manual`).
3. **`crypto` with no manual price:** an available market quotation (source `market`).
4. **Otherwise:** missing. A `stock`, `etf` or `other` holding without a manual price (defensive, not reachable through the API) SHALL be missing with reason `unsupported`.

**What each holding SHALL report:**
- its source, unit price and price currency, in the currency of the original quotation or the manual entry;
- its valuation time, as defined by `valuation-timestamps`;
- its value in the account currency, converted at the current rate through the application's existing currency conversion.

**Missing values:**
- A missing holding SHALL report a `null` value and one reason: `unsupported`, `price_unavailable` or `rate_unavailable`.
- A missing value SHALL never be reported, summed or displayed as zero.

**Time does not invalidate a known value:** elapsed time alone SHALL NEVER turn a known valuation into a missing one, flag it or change its status.

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

An investment or crypto account SHALL always be valued from its holdings, and the API SHALL return an aggregate `holdingsValuation` in the account currency, even when the account has no holdings:
- `value`: the sum of the non-missing holding values. With no holdings it is 0;
- `status`: `complete`, `partial` when any holding is missing, or `empty` when the account has no holdings;
- `missingCount` and `holdingCount`;
- the missing holdings, which are also named in the holdings list.

**Rounding:**
- Each holding's value SHALL be summed exactly, before any rounding.
- The aggregate SHALL be rounded once, to the account currency's minor units.
- A per-holding value SHALL be rounded only for its own display.

**Ledger balance:**
- The transaction-derived balance SHALL NEVER count as the value of an investment or crypto account, in account detail, the account list, totals, dashboards, reports or net worth.
- Transactions SHALL be preserved untouched, and the existing balance fields on the account object SHALL keep their meaning for API compatibility. The UI SHALL NOT present them for these account types.
- The aggregate carries no ledger-derived figure.

**Other accounts:**
- `GET /accounts` SHALL return `holdingsValuation` as non-null for every `investment` and `crypto` account, and `null` for every other type.
- Bank, cash and credit-card accounts SHALL behave exactly as before.

#### Scenario: Cash plus crypto
- **WHEN** an `investment` account holds 250 USD of cash and 0.01 BTC valued at 60000 USD each
- **THEN** its value is 850 USD with status `complete`, whatever its transactions sum to

#### Scenario: Empty account
- **WHEN** an `investment` account has no holdings but a ledger balance of 1000
- **THEN** `holdingsValuation` has value 0, status `empty` and holdingCount 0, and the 1000 appears nowhere as its value

#### Scenario: Partial aggregate
- **WHEN** an account has one holding valued at 100 and one missing holding
- **THEN** the value is 100 with status `partial`, and the missing holding is named with its reason

#### Scenario: Rounding only at the boundary
- **WHEN** three holdings convert to 0.333..., 0.333... and 0.333... USD
- **THEN** the aggregate is 1.00 USD, not 0.99

#### Scenario: Other account types unchanged
- **WHEN** a `checking`, `cash` or `credit_card` account is listed
- **THEN** `holdingsValuation` is `null`, and its balance and every existing field behave exactly as before

### Requirement: Holdings API, permissions and atomicity

**Reading:** `GET /accounts/:id/holdings` SHALL return the account's holdings with their valuations and the aggregate.

**Writing:** `PATCH /accounts/:id/holdings` SHALL accept a change set of the form `{ upsert: [...], remove: [ids] }`:
- An `upsert` item without `id` creates a holding.
- An `upsert` item with `id` updates that holding's quantity, manual valuation, or `name` and `unit` for `other`. `kind` and `code` cannot be changed.
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

### Requirement: Net contributions on accounts

`GET /accounts` SHALL return `contributions` on every account item: an `AccountContributions` object (`currency`, `incoming`, `outgoing`, `net`, `transferCount`, `excludedCount`) for `investment` and `crypto` accounts, and `null` for every other type. It SHALL be computed on read from the transactions already loaded, with no new table, ledger or duplicate rows, and the same field SHALL appear through `/v1` and MCP `list_accounts`.

- A qualifying incoming transfer has `type` transfer, `transferToAccountId` equal to the account and a different source account, which may be deleted; its amount is `destinationAmount`.
- A qualifying outgoing transfer has `type` transfer and `accountId` equal to the account and a different destination, which may be deleted; its amount is `accountAmount`, which already includes any fee effect.
- Self-transfers, income, expense, the initial balance and anything else SHALL NOT count.
- A qualifying transfer whose relevant amount is null SHALL be excluded and counted in `excludedCount`, never estimated. `transferCount` counts included transfers.
- Amounts are the native amounts recorded in the account currency when the transfer was saved. There SHALL be no revaluation at current rates.
- Sums use exact decimal math and are rounded once to the account currency's minor units; `net` is incoming minus outgoing.
- Edits, deletions and reverse transfers SHALL be reflected on the next read.
- `contributions` SHALL NOT be part of `holdingsValuation`, account totals or net worth.

#### Scenario: Transfer in and out
- **WHEN** a checking account transfers 1000 into an investment account and 200 comes back
- **THEN** its contributions are incoming 1000, outgoing 200, net 800 and transferCount 2

#### Scenario: Non-transfers and self-transfers excluded
- **WHEN** the account has income, expense and a self-transfer
- **THEN** none of them changes `contributions`

#### Scenario: Missing amount
- **WHEN** a qualifying transfer has no recorded amount
- **THEN** it is excluded from the sums, `excludedCount` is 1 and no amount is estimated

#### Scenario: Deleted counterpart
- **WHEN** the source account of an incoming transfer was deleted
- **THEN** the transfer still counts

#### Scenario: Cross-currency transfer
- **WHEN** a transfer into a USD account was saved with destinationAmount 50 USD
- **THEN** 50 counts, regardless of current exchange rates

#### Scenario: Edit, delete and reverse
- **WHEN** a transfer is edited, another is deleted and a reverse transfer is added
- **THEN** the next `GET /accounts` reflects the new amounts, the deletion and the reduced net

#### Scenario: Other account types
- **WHEN** an account is checking or a credit card
- **THEN** its `contributions` is null

#### Scenario: Independent of value
- **WHEN** contributions change
- **THEN** `holdingsValuation.value` stays the holdings-based sum
