## ADDED Requirements

### Requirement: Security search through the provider

The API SHALL expose `GET /currencies/securities?q=` for authenticated users. It SHALL search stocks and ETFs through the configured securities provider from the server, and return `{ available, results }`.

**Results:** each result SHALL carry `symbol`, `name`, `exchange` (display name), `micCode`, `country`, `currency` and `type`.

**Input and filtering:**
- The query SHALL be validated by a shared schema: 1-20 characters, trimmed.
- Results SHALL be limited to equity and ETF instrument types.
- Results SHALL be limited to a currency that FlowLedger supports.
- Results SHALL be limited to symbols that match the stock/ETF ticker rule.

**Load and secrets:**
- Results SHALL be cached in server memory per normalized query.
- Requests SHALL be rate-limited per user.
- The provider API key SHALL never be sent to the browser, returned or logged.

**No catalog:** no local securities catalog SHALL be created or populated. Search results are not persisted unless the user saves a holding.

**Unavailable search:** when no provider key is configured, or the provider fails, the response SHALL be `available: false` with no results, and the request SHALL NOT fail the page.

#### Scenario: Ambiguous symbol
- **WHEN** a user searches `AAPL`
- **THEN** the results include Apple Inc. on NASDAQ (`XNGS`, USD) and on BMV (`XMEX`, MXN) as distinct entries

#### Scenario: No provider key
- **WHEN** no securities provider API key is configured and a user searches
- **THEN** the response is `{ available: false, results: [] }` and stock/ETF holdings can still be added manually

#### Scenario: Key never exposed
- **WHEN** any search succeeds or fails
- **THEN** neither the response nor the logs contain the provider API key

### Requirement: Automatic quotes for provider-linked stock and ETF holdings

A provider-linked `stock` or `etf` holding without a manual price SHALL be valued from its stored last quote: `marketPrice` in `quoteCurrency`, with `marketPricedAt` as its valuation time.

**Reads:**
- Reading holdings, accounts or net worth SHALL NOT call the provider.
- The quote SHALL keep its original currency and be converted into the account currency through the existing currency conversion. A conversion failure gives `rate_unavailable`.
- The holding value SHALL be `quantity × marketPrice`, converted to the account currency, and the account's Total value remains derived only from holdings.

**Refresh:**
- A background refresh SHALL quote each distinct `(code, exchange)` of provider-linked holdings that have no manual price. It runs on a configurable schedule (default: once per weekday after the market close), within the provider's rate limit.
- It SHALL update every holding of that listing with the quoted price and the provider's own quote time.
- It SHALL NOT start when no provider key is configured.
- A newly created provider-linked holding without a manual price SHALL be quoted once on save, on a best-effort basis. A failed quote SHALL NOT fail the save.

**Reported fields:** the holding SHALL report source `market`, the unit price, the price currency, and as its timestamp the provider's quote time, not the fetch time.

#### Scenario: Linked US stock
- **WHEN** a USD investment account holds 10 AAPL on `XNGS`, and the stored quote is 352.78 USD at 2026-11-16 20:59 UTC
- **THEN** the holding shows a unit price of 352.78 USD, a market source label that names the provider, that quote time as its last update, and a value of 3527.80 USD

#### Scenario: Quote in another currency
- **WHEN** the same account holds 100 `NAFTRACISHRS` on `XMEX` with a stored quote in MXN
- **THEN** its unit price stays in MXN and its value is converted into USD through the existing conversion

#### Scenario: Same listing in several accounts
- **WHEN** two accounts of different users hold AAPL on `XNGS`
- **THEN** one refresh request updates both holdings, and neither user can see the other's holding

#### Scenario: Reads do not call the provider
- **WHEN** a user opens the accounts list, an account's holdings, or the financial overview
- **THEN** no request is made to the securities provider

### Requirement: Manual override precedence for securities

For provider-linked `stock` and `etf` holdings, a manual price SHALL take precedence over the stored market quote until the user clears it. A refresh SHALL never change a manual price. Holdings with a manual price SHALL be skipped by the refresh.

#### Scenario: Override wins
- **WHEN** a linked AAPL holding has a manual price of 340 USD and its stored market quote is 352.78 USD
- **THEN** the holding is valued at 340 USD and labeled "Manual"

#### Scenario: Clearing the override
- **WHEN** the user clears that manual price
- **THEN** the holding is valued from the stored market quote with source `market`

### Requirement: Failures, missing quotes and freshness labeling

**Failures:**
- A refresh failure, rate limit, unknown symbol or plan restriction SHALL leave the stored quote and its time unchanged.
- It SHALL never delete a holding or clear or overwrite a manual price.
- A quote whose currency differs from the holding's `quoteCurrency` SHALL be discarded.

**Missing quotes:** a linked holding with no stored quote and no manual price SHALL be missing with reason `price_unavailable`. It SHALL never be valued at zero, and the account value SHALL be partial under the existing policy.

**Freshness labeling:**
- The market source label SHALL name the provider and SHALL NOT claim real-time data.
- Its accessible description SHALL state that the price may be delayed or end-of-day.
- Following `valuation-timestamps`, there SHALL be no time-based stale flag: the provider's quote time is the freshness signal.

#### Scenario: Provider outage
- **WHEN** the provider is unreachable during a refresh and AAPL was last quoted yesterday at the close
- **THEN** the holding keeps yesterday's price and shows yesterday's quote time

#### Scenario: Plan does not cover the exchange
- **WHEN** the provider refuses quotes for `XMEX` on the configured plan
- **THEN** linked BMV holdings without a manual price are missing with reason `price_unavailable`, the UI invites the user to set a manual price, and the account shows a partial Total value

#### Scenario: Never labeled real-time
- **WHEN** a market-priced stock holding is shown
- **THEN** its source label is "Market (<provider name>)", and its description says the price may be delayed or end-of-day

### Requirement: Stock and ETF search-and-select in the Holdings tab

In the account Form View Holdings tab, adding a `stock` or `etf` holding SHALL offer a security search instead of the free-text ticker input. The search SHALL be:
- debounced (about 300 ms), with stale responses ignored;
- keyboard and screen-reader accessible (combobox pattern: arrow keys, Enter, Escape);
- usable on mobile widths.

**Results:** each result SHALL show the symbol, name, exchange and currency, so that similarly named securities can be told apart. The results area SHALL have loading, empty and error/unavailable states.

**Selecting a result:**
- It SHALL fill the code, exchange, name and quote currency.
- It SHALL offer a Price source choice: automatic (provider) or manual. Manual uses the existing manual price input, defaulting to the quote currency.

**Manual fallback:** a "Enter ticker manually" option SHALL always be available, and it SHALL create an unlinked, manually priced holding exactly as in B-009.

**Saved rows:** a saved linked holding SHALL show its symbol, exchange and name.

**Unchanged behavior:** the existing Save and Discard draft behavior SHALL apply unchanged.

#### Scenario: Search and select
- **WHEN** a user adds a Stock, types `AAPL`, selects "AAPL · Apple Inc. — NASDAQ (XNGS) · USD", enters quantity 10, keeps the automatic Price source and saves
- **THEN** a provider-linked holding is stored, and it shows the market price once quoted, or "Market price unavailable; set a manual price" until then

#### Scenario: Keyboard selection
- **WHEN** a keyboard user types a query, moves through results with the arrow keys and presses Enter
- **THEN** the highlighted listing is selected, and Escape closes the results without changing the draft

#### Scenario: Search unavailable
- **WHEN** search reports `available: false`
- **THEN** the UI says search is unavailable and offers manual ticker entry with a required manual price
