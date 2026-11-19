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

