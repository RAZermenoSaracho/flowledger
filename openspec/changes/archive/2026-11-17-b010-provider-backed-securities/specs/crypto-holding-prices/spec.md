## MODIFIED Requirements

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
- any stored crypto price.

**Scope:** only `crypto` holdings SHALL use this feed. `fiat`, `stock`, `etf` and `other` holdings SHALL never trigger a Binance lookup. Stock and ETF market prices are defined by `security-holding-prices`, and `other` prices are manual only.

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

