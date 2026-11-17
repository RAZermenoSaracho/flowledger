# Tasks

## 1. Data model and shared contracts (ST-015)

- [x] 1.1 Add the additive Prisma migration `b009_holdings`. It adds:
  - the `AccountType.crypto` value;
  - the `HoldingKind` enum (`crypto`, `fiat`);
  - the `Holding` model from design D2, with cascades to `Account` and `User`, `@@unique([accountId, kind, code])` and `@@index([userId])`.

  Verify that `npm run prisma:migrate` and `npm run prisma:generate` succeed, that the migration contains no destructive statement, and that `docs/DATA_MODEL.md` documents the model and the enum value.
- [x] 1.2 In `packages/shared`:
  - add `crypto` to `ACCOUNT_TYPES`;
  - add `holdingKindSchema`, `holdingUpsertSchema` and `holdingsChangeSetSchema` to `schemas/accounts.ts`, applying D7's create/update rules, D3's precision rules, no manual price on `fiat`, and no future `manualPricedAt`;
  - add the holding valuation response types (D4 contract) and `holdingsValuation` on the account list item;
  - add the `crypto_usdt_as_usd` disclosure code.

  Verify with `schemas/tests/accounts.test.ts` and `reports.test.ts` cases for:
  - valid create and update;
  - `kind` or `code` on an update;
  - a non-ISO `fiat` code;
  - a 3-decimal USD amount and a 19-decimal crypto amount;
  - zero or negative quantity;
  - a manual price on `fiat`;
  - a future timestamp.

## 2. Valuation core and holdings API (ST-015)

- [x] 2.1 Add `accounts/utils/holdingValuation.ts` with `valueHoldings`. It is a pure function with `quote` and `rate` injected (wired to the existing currency services in 2.2 and 6.2) and no clock input. It implements D4's precedence, preserves the original price currency, uses the missing reasons, and keeps exact `Decimal` values until rounding once at the aggregate (D3). Verify with `utils/tests/holdingValuation.test.ts` covering:
  - fiat at par, with no timestamp;
  - a manual price in another currency converted to the account currency;
  - a manual price from 400 days ago that still counts with no flag;
  - each missing reason, and that a missing holding is never 0;
  - the known subtotal with `partial` status;
  - three thirds that sum to 1.00, not 0.99;
  - 18-decimal quantities with no drift;
  - JPY and MXN rounding;
  - one rate lookup per currency pair.
- [x] 2.2 Add `accounts/services/holdings.read.service.ts`:
  - `getAccountHoldings(userId, accountId)`, using `findFirst({ id, userId })` and `notFound()`;
  - `valueHoldingsForAccounts(userId, accounts)`, issuing one `holding.findMany({ where: { userId, accountId: { in } } })` and computing `netDeposited` with `calculateAccountBalance`.

  Also add `quantity`, `manualUnitPrice` and valuation value keys to `serialize()`'s native-amount keys. Verify with `mockDeep<PrismaClient>()` service tests for ownership scoping, a cross-user 404, a single query and the response shape, plus `serialize.test.ts` for exact strings.
- [x] 2.3 Add `accounts/services/holdings.update.service.ts` with `applyHoldingChanges`. It runs one `$transaction` that:
  - enforces account eligibility;
  - rejects foreign or cross-account ids with `notFound()`;
  - maps a unique violation to 400;
  - sets `manualPricedAt` when the price or price currency changes, and clears it together with the price;
  - returns the same body as GET.

  Verify with service tests for:
  - create, update and remove;
  - full rollback when one item is invalid;
  - a duplicate `(kind, code)`;
  - a holding id from another account or user;
  - an ineligible type;
  - a quantity-only edit that keeps `manualPricedAt`.
- [x] 2.4 Guard type changes in `accounts/services/update.service.ts`: reject a non-eligible type while holdings exist. Verify with `update.service.test.ts` cases for the rejection and for an unchanged type change on an account without holdings.
- [x] 2.5 Add `controllers/holdings.controller.ts`, plus `GET` and `PATCH /accounts/:id/holdings` in `accounts.routes.ts`, using `validate(holdingsChangeSetSchema)`, `asyncHandler` and `serialize()`. Verify with `controllers/tests/holdings.controller.test.ts` and with `accounts/tests/accounts.routes.test.ts` (testcontainers) for 200, 400, cross-user 404, atomic rollback, and the cascade on account delete.

## 3. Aggregate value and net worth (ST-015)

- [x] 3.1 In `listAccounts`, attach `holdingsValuation` (`null` without holdings) through `valueHoldingsForAccounts`, inside its existing `Promise.all`. Verify with `read.service.test.ts` that accounts without holdings are byte-for-byte unchanged, and that an account with holdings carries the aggregate and `netDeposited`.
- [x] 3.2 In `computeNetWorth`, use the converted aggregate in place of the ledger balance for accounts with holdings. Name each missing holding as `"<name> · <code>"` in `excluded`. Limit `investment_recorded_balance` to `investment` and `crypto` accounts without holdings, and add `crypto_usdt_as_usd`. Verify with `financialOverview.service.test.ts`:
  - **No double counting:** 4000 plus an account with a 1000 ledger balance and 850 in holdings gives 4850.
  - **Transfer into a holdings account:** the account value is unchanged and net worth falls by the transfer.
  - **Missing holding:** the result is partial, the missing holding is named, and the known subtotal still counts.
  - **Disclosures:** each disclosure appears exactly when it applies, and no age-based disclosure appears for a one-year-old price.
  - **Parity:** the figure equals the account endpoint's `value`.
  - **Regression:** totals are identical for a user without holdings, and credit-card behavior is unchanged.

## 4. API surfaces

- [x] 4.1 Add `GET` and `PATCH /v1/accounts/:id/holdings` to `v1.routes.ts`, with the `read` and `write` scopes, and document them in `docs/PUBLIC_API.md`, including the missing credit-card row. Verify with v1 route tests for the scope split and an identical response body.
- [x] 4.2 Add the MCP tools `list_holdings` (read) and `update_holdings` (write, with `destructiveHint` and the description rules), using the shared schemas. Make the account tools accept `crypto`. Verify with MCP tool tests:
  - the read and write tool lists (the count rises by 2);
  - parity with REST;
  - a partial upsert that leaves the other rows untouched;
  - a cross-user not-found.

## 5. Web (ST-015)

- [x] 5.1 Add `getAccountHoldings` and `updateAccountHoldings` to `services/accounts.client.ts`. Add a `useAccountHoldings` hook that invalidates the accounts, holdings and `financial-overview` queries on save. Add the `crypto` label to `accountDisplay.ts`, and `formatValuationTime` to `utils/dateTime.ts` (D6a). Verify with `msw` hook tests and a `dateTime.test.ts` case.
- [x] 5.2 Add `pages/Accounts/components/ValuationTime.tsx` (D6a). It shows the price as a focusable trigger with a "Last updated: …" tooltip that opens on hover, focus and tap, is dismissed with `useDismiss`, and is linked through `aria-describedby`. It has a secondary-label variant for stacked rows. Verify with component tests for keyboard focus, tap, Escape, the accessible description, and no output for a missing valuation.
- [x] 5.3 Add `pages/Accounts/components/HoldingsTab.tsx`: a `RelatedList` with `EditableField` cells in the account draft, following the `TransactionSharingTab` pattern.
  - Each row shows code and kind (cash visibly distinct), the exact quantity, the unit price in its original currency inside `ValuationTime`, the value, and the source label.
  - A missing holding shows "Value missing" with its reason.
  - The tab offers clear-override, inline precision errors and the deposit hint.

  Register the tab for `investment` and `crypto` accounts in `AccountDetailPage.tsx`, and extend Save so it sends the holdings `PATCH` when holdings are dirty. Verify with component tests for:
  - tab visibility by account type;
  - add, then save sending one change set;
  - Discard;
  - "Value missing" never rendering 0;
  - no stale badge or warning color for an old price;
  - clear-override;
  - stacked rows at mobile width.
- [x] 5.4 In the account header, show the aggregate (labeled partial when partial) next to "Net deposited". Show the aggregate on the accounts list for accounts with holdings. Add the `crypto_usdt_as_usd` entry to `DISCLOSURE_TEXT` in `FinancialOverviewSection.tsx`. Verify with component tests that an account without holdings renders as before and that the disclosure text renders.

## 6. Automatic crypto prices (ST-016), reusing existing pricing

- [x] 6.1 In `currencies/providers/binance/binance.client.ts`:
  - add `getBinanceTickerFetchedAt()`, which returns the existing cache's `fetchedAt` or `null`;
  - make `fetchBinanceTickerPrices()` return the existing cached list, with its `fetchedAt` unchanged, when a refresh fails and a list exists. It still throws when none exists.

  Add no new cache, quote function or persistence. Verify with `binance.client.test.ts`:
  - a fresh fetch, and a cache hit within 60 s;
  - after a failure hours later, the old list is returned and `getBinanceTickerFetchedAt()` is unchanged;
  - a throw when nothing has ever been fetched.

  Adjust the existing failure test to match the new behavior.
- [x] 6.2 In `holdings.read.service.ts`, build `valueHoldings`'s `quote` from the existing `getCryptoUsdtPrice(code)` and `getBinanceTickerFetchedAt()`:
  - a result of `null` → `unsupported`;
  - a throw → `price_unavailable`;
  - otherwise, currency `USDT`.

  Build its `rate` from the existing `getExchangeRate`. Verify with holdings read-service tests for:
  - market valuation in a USD account and in an MXN account;
  - override precedence, and clearing the override;
  - the last known price after an outage, with its original time;
  - an unsupported code;
  - an outage with no data, which never values at 0.

  Also verify with `currencies/services/tests/read.service.test.ts` that `getExchangeRate` uses the last known crypto price during an outage and that fiat is unchanged.
- [x] 6.3 Show the "Market (Binance, USDT = USD)" source and its `ValuationTime` in `HoldingsTab`. Verify with a component test.

## 7. Docs and completion

- [x] 7.1 Update `docs/DOMAIN_LOGIC.md` with D1's account-value rule and its event table, the valuation precedence, boundary rounding and the freshness policy. Update `docs/DATA_MODEL.md` and the MCP and `/v1` docs. Log the deferred items in `docs/KNOWN_ISSUES.md`: contract identity, a persisted last quotation, buy/sell transactions, and the USDT peg. Verify that the docs are in English and that none states the old `investment_recorded_balance` meaning.
- [x] 7.2 Run `npm run typecheck`, `npm run lint` and `npm run test`, plus the integration and e2e suites with the Docker VM, and verify that everything passes. Then run a manual acceptance on dev:
  - create a `crypto` account with BTC, ETH and USD holdings;
  - set and then clear an override;
  - make an unsupported token show "Value missing" and the known subtotal show as partial;
  - check the "Last updated" tooltip by mouse, keyboard and tap;
  - check that net worth includes the holdings once;
  - check that the production host can reach `api.binance.com`.

## 8. Revision after manual review

Group 8 supersedes the "Net deposited", ledger-balance and two-kind behavior in groups 1-5.

- [x] 8.1 Shared (`packages/shared`): `HOLDING_KINDS` (`crypto`, `fiat`, `stock`, `etf`, `other`), `HOLDING_KINDS_BY_ACCOUNT_TYPE`, `MANUALLY_PRICED_HOLDING_KINDS`; `holdingUpsertSchema` with `name`, `unit`, nullable code, crypto code not an ISO fiat code, ticker pattern, manual price required for stock/etf/other; `Holding` type with `code: string | null`, `name`, `unit`; `HoldingsValuation` with `status` `complete|partial|empty`, `missingCount`, `holdingCount` and no `netDeposited`; the `investment_without_holdings` disclosure. Verify with schema tests for each kind and rule.
- [x] 8.2 Prisma: one additive migration created with Prisma (`HoldingKind` += `stock`, `etf`, `other`; `Holding.code` nullable; `Holding.name` VarChar 80; `Holding.unit` VarChar 20), keeping `@@unique([accountId, kind, code])`, with no data rewrite. Update `docs/DATA_MODEL.md`.
- [x] 8.3 API valuation: `holdingValuation.ts` values by kind and source (cash at par, crypto market or manual, stock/etf/other manual only and missing `unsupported` without a price), never calls Binance for non-crypto, returns `valuedAt: null` for `USDT`, and drops `netDeposited`. `valueHoldingsForAccounts` returns a non-null `holdingsValuation` (status `empty`, value 0) for every investment/crypto account and `null` otherwise. Verify with util and service tests.
- [x] 8.4 API rules in `holdings.update.service.ts` and `accounts/services/update.service.ts`: per-account-type kinds, rejected updates and allowed removal for incompatible holdings, rejected `investment` to `crypto` with non-crypto holdings, rejected clearing of a stock/etf/other price, rejected `unit` on non-`other` and null `name` on `other`. Verify with service tests, including the same behavior via `/v1`.
- [x] 8.5 Net worth: `financialOverview.service.ts` counts `holdingsValuation.value` (0 when empty) for investment/crypto, emits `investment_without_holdings` and no longer emits `investment_recorded_balance`. Verify with tests for the 4850 case, an empty account contributing 0, partial naming, and unchanged bank/cash/credit-card totals.
- [x] 8.6 MCP: `update_holdings` description and schema list the five kinds, `name`/`unit` and the manual price rule, and the kind rule applies. Update `docs/PUBLIC_API.md` and the MCP docs. Verify with MCP and `/v1` tests.
- [x] 8.7 Web: header Total value with partial/empty indication (no Net deposited, no ledger balance, no cash reminder); account list and totals use `holdingsValuation.value`; Holdings tab with the Add Holding flow, Price source selector, integrated money input using the existing currency picker, new table columns, stacked mobile rows and incompatible rows with remove only; `DISCLOSURE_TEXT` for `investment_without_holdings`. Verify with component tests for each scenario in `account-form-view`.
- [x] 8.8 Docs: update `docs/DOMAIN_LOGIC.md` (holdings-only valuation, kinds, price sources, no invented timestamps) and `docs/KNOWN_ISSUES.md`; verify that no doc still describes "Net deposited" or `investment_recorded_balance` emission.
- [x] 8.9 Staging: verify the migration applies on `flowledger_staging`, that the two stored `fiat` holdings in crypto accounts are untouched, still valued and counted, can be removed but not updated, and that net worth matches the account totals.

## 9. Acceptance round 2

- [x] 9.1 Shared: `AccountContributions` type and the `contributions` field on the account type. Verify with typecheck.
- [x] 9.2 API: `calculateAccountContributions` in `transactionCalculations.ts` plus the `contributions` field in `listAccounts`. Verify with util tests (incoming, outgoing, self-transfer, income/expense excluded, null amount excluded and counted, deleted counterpart, fee, rounding, cross-currency), a `read.service` test (null for other types, `holdingsValuation` unaffected), a net worth test, and an integration test that transfers in, out, edits and deletes. Update the MCP `list_accounts` description.
- [x] 9.3 Web price display: manual price as text with inline edit on activation in `HoldingsTab`. Verify with component tests for the four scenarios.
- [x] 9.4 Web initial balance: hide the field for investment/crypto in create and the General tab. Verify with component tests, including the type switch.
- [x] 9.5 Web contributions line in the Transactions tab, plus `contributions` in `accounts.types.ts`. Verify with component tests for shown, excluded note and hidden.
- [x] 9.6 Docs and staging: update `docs/DOMAIN_LOGIC.md` and `docs/PUBLIC_API.md`, then smoke-test contributions on `flowledger_staging`.
