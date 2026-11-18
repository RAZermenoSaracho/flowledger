## MODIFIED Requirements

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
