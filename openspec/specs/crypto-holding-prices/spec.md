# crypto-holding-prices Specification

## Purpose
Values supported crypto holdings automatically, using the crypto price feed FlowLedger already has. Quantities stay manual, and a manual override always takes precedence. Each price keeps its original quotation currency and the time it was last updated. A price that is unavailable or unsupported is never treated as zero.

## Requirements

### Requirement: Market quotation for crypto holdings

A `crypto` holding without a manual price SHALL be valued from the existing Binance price feed. The feed is looked up as `{CODE}USDT`, and if that is missing, as the inverse `USDT{CODE}`.

**Quotation:**
- The quotation SHALL keep its original currency, `USDT`.
- It SHALL be converted into the account currency through the application's existing currency conversion. No valuation code SHALL assume USD or any other fixed currency.
- Treating USDT as equal to USD is a property of the existing conversion infrastructure and is disclosed.

**Reported fields:** the holding SHALL report source `market`, the unit price, price currency `USDT`, and as its timestamp the time of the last successful price fetch.

**What SHALL NOT be added:**
- a scheduler;
- an additional provider;
- a second cache or quote API;
- any stored price.

**Scope:** only `crypto` holdings SHALL use this feed. `fiat`, `stock`, `etf` and `other` holdings SHALL never trigger a Binance lookup, and stock/ETF/other prices are manual only.

**USDT identity:** for the code `USDT` the quotation is the identity (1 USDT per USDT), not a fetched price. Its valuation time SHALL be `null`, because no timestamp is invented.

Prices SHALL be resolved when holdings are read, through the existing crypto price lookup and its existing short-lived cache.

#### Scenario: Supported asset
- **WHEN** a user holds 0.5 BTC with no manual price in a USD account, and Binance quotes BTCUSDT at 60000
- **THEN** the holding shows a unit price of 60000 USDT, the source "Market (Binance)" and its last-updated time, and a value of 30000 USD

#### Scenario: Non-USD account
- **WHEN** the same holding is in an MXN account
- **THEN** its unit price stays 60000 USDT, and its value is converted into MXN through the existing conversion

#### Scenario: USDT has no timestamp
- **WHEN** a user holds 100 USDT in a USD account
- **THEN** the holding is valued at 100 USD with source `market`, and its valuation time is `null`, so no "Last updated" is shown

#### Scenario: Non-crypto never calls Binance
- **WHEN** an account holds a `stock`, an `etf`, an `other` asset and USD cash
- **THEN** no Binance price lookup is made for any of them

#### Scenario: Quantity stays manual
- **WHEN** the market price changes
- **THEN** the holding's quantity is unchanged, and only its value changes

### Requirement: Manual override precedence

For `crypto` holdings, a manual price SHALL always take precedence over the market quotation until the user clears it. After it is cleared, the holding SHALL use the market quotation on the next read.

#### Scenario: Override wins
- **WHEN** a BTC holding has a manual price of 55000 USD and the market quotes 60000 USDT
- **THEN** the holding is valued at 55000 USD and labeled "Manual"

#### Scenario: Clearing the override
- **WHEN** the user clears that manual price
- **THEN** the holding is valued from the market quotation with source `market`

### Requirement: Last known price, unavailable and unsupported

**Last known price:** If refreshing the price feed fails, the last successfully fetched prices held by the running server SHALL remain in use as the last known prices, with their original timestamp. They SHALL stay in use until a newer fetch replaces them. The time elapsed since that fetch SHALL NEVER invalidate them.

**No usable price:** If no price data exists in the running server, or the code has no USDT quotation, the holding SHALL fall back to a manual price when one exists. Otherwise it SHALL be missing, with reason `price_unavailable` or `unsupported`. A missing holding SHALL never be valued at zero.

**Existing conversions:** Because holdings reuse the existing price feed, the last known prices SHALL also serve every other crypto conversion (account balances in the preferred currency, reports, net worth, debts and rate suggestions) during a refresh failure, instead of failing. Fiat conversions SHALL keep their current behavior.

#### Scenario: Provider outage after an earlier fetch
- **WHEN** Binance is unreachable and the server last fetched prices successfully 20 minutes ago
- **THEN** the holding uses that price, shows that fetch time as its last update, and shows no warning or other flag

#### Scenario: Outage with no prior data
- **WHEN** Binance is unreachable and the server has no earlier price data
- **THEN** a holding without a manual price is missing with reason `price_unavailable`, the account value is partial, and the request succeeds

#### Scenario: Other crypto conversions during an outage
- **WHEN** Binance is unreachable after an earlier successful fetch, and the user views account balances in their preferred currency
- **THEN** crypto accounts are converted at the last known prices instead of failing

#### Scenario: Unsupported token
- **WHEN** a user holds a token code that Binance doesn't quote against USDT
- **THEN** the holding is missing with reason `unsupported`, and the UI invites the user to set a manual price

### Requirement: USDT-as-USD disclosure

Wherever a market-priced crypto holding contributes to a displayed value, its source label SHALL state that it is a Binance USDT quotation, and that the conversion treats USDT as USD.

#### Scenario: Source label
- **WHEN** a market-priced holding is shown
- **THEN** its source states that it is a Binance USDT quotation, converted as USDT = USD
