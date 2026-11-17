# Tasks

## 0. Gate (before /opsx:apply)

- [ ] 0.1 The product owner approves the Twelve Data plan (display rights, BMV coverage) and the open questions in `design.md`.

## 1. Data model and shared contracts

- [ ] 1.1 `schema.prisma`: add `exchange` (VarChar 10), `quoteCurrency` (VarChar 10), `marketPrice` (Decimal 38,18) and `marketPricedAt` to `Holding`, and change the unique key to `[accountId, kind, code, exchange]`. Generate the additive migration `b010_security_listing` with `prisma migrate dev`.
- [ ] 1.2 `packages/shared` schemas:
  - add `securitySearchQuerySchema` and the `SecuritySearchResult` type;
  - `holdingUpsertSchema` accepts `exchange` and `quoteCurrency` (together, create-only, stock/ETF only) and `name` on stock/ETF;
  - require a manual price for stock/ETF only without an `exchange`.
  Update `MANUALLY_PRICED_HOLDING_KINDS` usages accordingly. Add tests in `schemas/tests/`.
- [ ] 1.3 Shared `Holding` type: add the listing fields and `marketPrice`/`marketPricedAt`. Add `serialize()` native-amount keys for `marketPrice`.

## 2. Provider client and search

- [ ] 2.1 `config/env.ts` and `.env.example`: add optional `TWELVE_DATA_API_KEY`, `SECURITIES_PRICE_REFRESH_INTERVAL_MINUTES` (default 60) and `TWELVE_DATA_CREDITS_PER_MINUTE` (default 8).
- [ ] 2.2 `currencies/providers/twelveData/twelveData.client.ts`:
  - `searchSecurities(q)` and `fetchQuote(symbol, mic)`, with the key sent as a header and a timeout;
  - parse prices as decimal strings;
  - map 429, plan-restriction and unknown-symbol responses to typed errors;
  - never log the key.
  Tests in `tests/twelveData.client.test.ts` cover the provider's sample payloads, including the `XMEX` plan-restriction message.
- [ ] 2.3 Search service: an in-memory Map cache (1 h TTL, 500 entries), filtering by type, currency and ticker, and `available: false` without a key or on failure. Add a controller and `GET /currencies/securities` with `validate()` and a per-user rate limit. Add service and controller tests.

## 3. Valuation and holdings write path

- [ ] 3.1 `holdingValuation.ts`: allow the `market` source for linked stock/ETF. Unit tests cover linked, unlinked, override, missing quote and rate failure.
- [ ] 3.2 `holdings.read.service.ts` `marketQuote`: crypto stays unchanged, and linked stock/ETF read the stored quote with no provider call. Add tests.
- [ ] 3.3 `holdings.update.service.ts`:
  - make listing fields immutable;
  - reject unlinked `(kind, code)` duplicates;
  - allow clearing a manual price on linked holdings;
  - make one best-effort quote on create of a linked holding without a manual price, where a failure doesn't fail the save.
  Add tests.

## 4. Refresh scheduler

- [ ] 4.1 `currencies/providers/twelveData/securitiesPriceScheduler.ts`, in the Syncfy scheduler shape:
  - distinct linked pairs without a manual price;
  - the per-minute budget;
  - `updateMany` by `(code, exchange)`;
  - discard a currency mismatch;
  - stop or skip on 429 or errors, and skip overlapping runs;
  - no start without a key.
  Start and stop it in `server.ts`. Tests use fake timers and a mocked client.

## 5. API surfaces

- [ ] 5.1 `/v1`: add `GET /v1/currencies/securities` (read scope). Update the route tests and `docs/PUBLIC_API.md`.
- [ ] 5.2 MCP:
  - add the `search_securities` read tool;
  - update the `update_holdings` description and input schema with the listing fields;
  - update the tool-count tests (the write and read lists each gain one).

## 6. Web

- [ ] 6.1 `services/currencies.client.ts`: `searchSecurities(q)`. Add a `useSecuritySearch` hook (300 ms debounce, abort stale requests) and test it with msw.
- [ ] 6.2 `SecuritySearch.tsx` (ARIA combobox) shows results as symbol · name and exchange (MIC) · currency · type, and has loading, empty and unavailable states plus "Enter ticker manually". Add component tests, including keyboard navigation.
- [ ] 6.3 `HoldingsTab.tsx` and `holdingsDraft.ts`:
  - the search on new stock/ETF rows;
  - the Price source select for linked rows;
  - the saved-row display of symbol, exchange and name;
  - "Market (Twelve Data)" with a delayed/end-of-day description;
  - the `price_unavailable` copy.
  Update the existing tests.

## 7. Docs

- [ ] 7.1 Update `docs/DATA_MODEL.md` (new columns), `docs/DOMAIN_LOGIC.md` (linked securities, refresh, licensing note), the MCP docs and the README env table.
- [ ] 7.2 `SHORT_TERM_ROADMAP.md`: on completion only, mark ST-017 and B-010 complete.

## 8. Verification

- [ ] 8.1 Run `npm run typecheck`, `npm run lint` and `npm run test`. Run the integration suite for holdings with testcontainers.
- [ ] 8.2 Do browser acceptance on dev with a real key:
  - search AAPL and see both listings;
  - link XNGS, save, and see a priced holding with the quote time;
  - check override and clear;
  - link an XMEX listing on a plan without BMV and see a partial value with the manual fallback;
  - check the manual ticker fallback;
  - check keyboard-only and mobile-width flows;
  - check that no API key appears in browser network traffic.
- [ ] 8.3 Regression: crypto, cash and `other` holdings, existing unlinked stock/ETF rows, Net contributions and net worth stay unchanged.
