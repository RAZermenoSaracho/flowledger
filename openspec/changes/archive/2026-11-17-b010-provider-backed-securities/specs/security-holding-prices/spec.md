## ADDED Requirements

### Requirement: Security search through the provider

The API SHALL expose `GET /currencies/securities?q=` for authenticated users. It SHALL search stocks and ETFs through the configured securities provider from the server, and return `{ available, results }`.

**Results:** each result SHALL carry `symbol`, `name`, `exchange` (display name), `micCode`, `country`, `currency` and `type` (`stock` or `etf`, mapped from the provider's instrument type).

**Input and filtering:**
- The query SHALL be validated by a shared schema: 1-20 characters, trimmed.
- Results SHALL be limited to equity and ETF instrument types.
- Results SHALL be limited to a currency that FlowLedger supports.
- Results SHALL be limited to symbols that match the stock/ETF ticker rule.

**Load and secrets:**
- Results SHALL be cached in server memory per normalized query, and each uncached search SHALL reserve one credit from the shared budget. When the budget is spent, the response is `available: false`.
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

A provider-linked `stock` or `etf` holding without a manual price SHALL be valued from the shared quote of its listing `(code, exchange)`: the last valid price, in the quote currency, with the market quote time as its valuation time.

**Reads:**
- Reading holdings, accounts or net worth SHALL NOT call the provider.
- The quote SHALL keep its original currency and be converted into the account currency through the existing conversion. A conversion failure gives `rate_unavailable`.
- A quote whose currency differs from the holding's `quoteCurrency` SHALL NOT be used.
- The holding value SHALL be `quantity × price`, converted once per holding, and the account's Total value remains derived only from holdings.

**Shared cache:** one quote SHALL be kept per listing for all accounts and users, persisted in the database, so a refresh serves every holding of that listing and survives restarts.

**Reported fields:** a linked holding SHALL report `marketQuote` with:
- the provider (`twelve_data`), the price and its currency;
- `quotedAt`, when the price applies according to the provider;
- `checkedAt`, when FlowLedger last received a successful provider response;
- `stale`, and the last failure reason.

The valuation timestamp SHALL be `quotedAt`, never the fetch time.

#### Scenario: Linked US stock
- **WHEN** a USD investment account holds 10 AAPL on `XNGS`, and the stored quote is 352.78 USD quoted at 2026-11-16 20:59 UTC
- **THEN** the holding shows a unit price of 352.78 USD from Twelve Data, that quote time as its last update, and a value of 3527.80 USD

#### Scenario: Quote in another currency
- **WHEN** the same account holds 100 `NAFTRACISHRS` on `XMEX` with a stored quote in MXN
- **THEN** its unit price stays in MXN and its value is converted into USD through the existing conversion

#### Scenario: Same listing in several accounts
- **WHEN** three accounts of two users hold AAPL on `XNGS` and the listing is due
- **THEN** a single provider request updates the one shared quote, all three holdings use it, and neither user can see the other's holdings

#### Scenario: Reads do not call the provider
- **WHEN** a user opens the accounts list or the financial overview
- **THEN** no request is made to the securities provider

### Requirement: Event-driven, rate-limited quote refresh

Quotes SHALL be refreshed only on demand, through the server, with no background polling worker and no WebSocket streaming.

**Triggers:**
- Opening an account's Holdings tab: the stored holdings SHALL be shown first, and the tab then asks the server once to refresh that account's due listings.
- Saving a change set that creates a linked holding without a manual price, or clears the manual price of a linked holding: a best-effort refresh of that listing happens after the save. A failed refresh SHALL NOT fail the save.

**Not triggers:** a quantity-only edit, a repeated render, or a read SHALL NOT trigger a provider request.

**When a listing is due:** when it has no quote, or its next-attempt time has passed and a holding of it has no manual price. After a successful check, the next attempt is:
- the configurable refresh interval later (default 60 minutes) when the provider reported the market open;
- a longer configurable interval later (default 240 minutes) when the market was closed.

Trading hours SHALL NOT be assumed.

**Deduplication:** concurrent refresh requests from any account, user or process SHALL result in at most one provider request per listing, through an atomic claim in the database that expires if its holder crashes.

**Credit budget:**
- Every provider request, search included, SHALL first reserve its credit cost in a shared per-minute and per-UTC-day budget. The configurable limits default below the plan limits (6/min and 600/day for Basic's 8/min and 800/day).
- A reservation SHALL never exceed a limit, even across processes.
- When the minute budget is spent, remaining listings wait for the next trigger after that minute. When the day budget is spent, attempts are recorded as `quota_exhausted` until 00:00 UTC.

#### Scenario: Reopening the tab
- **WHEN** a user opens the Holdings tab of an account with AAPL quoted 10 minutes ago while the market is open, closes it and opens it again
- **THEN** no provider request is made, and the stored quote is shown both times

#### Scenario: Quantity-only edit
- **WHEN** a user changes only the quantity of a linked AAPL holding and saves
- **THEN** the change is saved and no provider request is made

#### Scenario: Concurrent refreshes
- **WHEN** two users open accounts holding AAPL on `XNGS` at the same moment and the listing is due
- **THEN** exactly one quote request is sent

#### Scenario: Minute budget reached
- **WHEN** an account has ten due listings and the minute budget allows six
- **THEN** six are refreshed, the other four keep their stored quotes, and they are refreshed by a later trigger

#### Scenario: Closed market
- **WHEN** the last check said the market was closed one hour ago
- **THEN** opening the tab makes no provider request for that listing

### Requirement: Manual override precedence for securities

For provider-linked `stock` and `etf` holdings, a manual price SHALL take precedence over the stored market quote until the user clears it. A refresh SHALL never change a manual price. A listing whose only holdings have a manual price SHALL NOT be refreshed.

#### Scenario: Override wins
- **WHEN** a linked AAPL holding has a manual price of 340 USD and its stored market quote is 352.78 USD
- **THEN** the holding is valued at 340 USD and labeled "Manual"

#### Scenario: Clearing the override
- **WHEN** the user clears that manual price
- **THEN** the holding is valued from the stored market quote with source `market`

### Requirement: Failures, missing quotes and stale state

**Failures:**
- On a rate limit, quota exhaustion, timeout, outage, missing coverage, plan restriction, or invalid or mismatched quote data, the stored price, its currency, its `quotedAt` and its `checkedAt` SHALL stay unchanged.
- The failure SHALL be recorded with its reason.
- A failure SHALL never value a holding at zero, delete a holding, or clear or overwrite a manual price.
- **Cooldown:**
  - a rate limit waits until the next minute, or until 00:00 UTC for a daily limit;
  - a plan restriction, an unknown symbol and invalid data wait 24 hours;
  - any other failure backs off exponentially from 15 minutes up to 6 hours.

**Missing quotes:** a linked holding with no valid stored quote and no manual price SHALL be missing with reason `price_unavailable`, and the account value SHALL be partial under the existing policy.

**Stale:** a stored quote SHALL be marked stale when either condition holds:
- the most recent provider attempt for it failed;
- at its last successful check the provider reported the market open, but the quote time was more than twice the refresh interval older than the check.

A stale quote SHALL still count in totals.

**Labeling:**
- The source label SHALL name Twelve Data and SHALL NOT claim real-time data.
- Its description SHALL state that prices may be delayed or end-of-day.
- It SHALL show "Last updated" (the quote time) and "Last checked" (the last successful check).
- A stale quote SHALL show a subtle stale indication, with the reason available.

#### Scenario: Provider outage
- **WHEN** the provider is unreachable during a refresh and AAPL was last quoted yesterday at the close
- **THEN** the holding keeps yesterday's price and quote time, it is marked stale, and the next attempt is delayed by the backoff

#### Scenario: Old quote from a successful request
- **WHEN** the provider reports the market open, but returns a quote from three hours before the check
- **THEN** the quote is stored with its own time and marked stale

#### Scenario: Plan does not cover the exchange
- **WHEN** the provider refuses quotes for `XMEX` on the configured plan
- **THEN** linked BMV holdings without a manual price are missing with reason `price_unavailable`, the UI invites the user to set a manual price, the account shows a partial Total value, and the listing is not retried for 24 hours

#### Scenario: Never labeled real-time
- **WHEN** a market-priced stock holding is shown
- **THEN** its source label names Twelve Data, and its description says the price may be delayed or end-of-day

### Requirement: Stock and ETF search-and-select in the Holdings tab

In the account Form View Holdings tab, adding a `stock` or `etf` holding SHALL offer a security search instead of the free-text ticker input. The search SHALL be:
- debounced (about 300 ms), with stale responses ignored;
- keyboard and screen-reader accessible (combobox pattern: arrow keys, Enter, Escape);
- usable on mobile widths.

**Results:** each result SHALL show the symbol, name, exchange and currency, so that similarly named securities can be told apart. The results area SHALL have loading, empty and error/unavailable states.

**Selecting a result:**
- It SHALL fill the code, exchange, name and quote currency, and set the kind from the result type.
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

#### Scenario: Opening holdings with cached prices
- **WHEN** a user opens a Holdings tab whose linked holdings have stored quotes
- **THEN** the stored prices are shown at once, with no loading placeholder, and are replaced in place if the refresh returns newer quotes
