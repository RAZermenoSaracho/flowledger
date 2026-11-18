# Tasks

## 0. Gate

- [x] 0.1 The product owner approves the provider (Twelve Data Basic, REST), the licensing posture (personal and staging use; production display is gated), BMV as manual, the stale label, and the event-driven refresh (`design.md`, "Decisions taken").

## 1. Data model and shared contracts

- [ ] 1.1 `schema.prisma`:
  - add `exchange` and `quoteCurrency` (VarChar 10, nullable) to `Holding`, with the unique key `[accountId, kind, code, exchange]`;
  - add the `SecurityQuote` and `ProviderCreditWindow` models (D2).

  Generate the additive migration `b010_security_quotes` with `prisma migrate dev`.
- [ ] 1.2 `packages/shared`:
  - add `securitySearchQuerySchema` and the `SecuritySearchResult`, `SecuritySearchResponse` and `SecurityMarketQuote` types;
  - add the constants `SECURITY_QUOTE_FAILURE_REASONS` and `SECURITY_TYPES`;
  - `holdingUpsertSchema` accepts `exchange` and `quoteCurrency` (together, create-only, stock/ETF only) and `name` on stock/ETF;
  - require a manual price for stock/ETF only without an `exchange`;
  - the `Holding` type gains `exchange`, `quoteCurrency` and `marketQuote`.

  Add tests in `schemas/tests/`.

## 2. Provider client, credit ledger, quote cache, search

- [ ] 2.1 `config/env.ts` and `.env.example`:
  - `TWELVE_DATA_API_KEY` (optional);
  - `SECURITIES_QUOTE_REFRESH_MINUTES` (60);
  - `SECURITIES_QUOTE_CLOSED_RECHECK_MINUTES` (240);
  - `TWELVE_DATA_CREDITS_PER_MINUTE` (6);
  - `TWELVE_DATA_CREDITS_PER_DAY` (600).
- [ ] 2.2 `currencies/providers/twelveData/twelveData.client.ts`:
  - `searchSymbols(q)` and `fetchQuote(symbol, mic)`, sending the `Authorization: apikey` header with a 5 s timeout;
  - parse prices as decimal strings;
  - map 429 (minute or daily), 403, 404, 401, 5xx, timeouts and invalid bodies to a typed error;
  - never log the key.

  Add client tests with sample payloads.
- [ ] 2.3 Credit ledger service: an atomic reservation in the minute and UTC-day windows (conditional `updateMany`), `markMinuteExhausted`, and a cleanup of old windows. Add tests.
- [ ] 2.4 Quote cache service `refreshSecurityQuotes(listings)`:
  - selection of due listings;
  - an atomic claim lease;
  - credit reservation;
  - success writes that keep `quotedAt` and `checkedAt`;
  - failure recording with cooldown and backoff, which never touches the price;
  - a `currency_mismatch` guard;
  - `isQuoteStale`.

  Add tests covering dedup, budgets, quota exhaustion, failures, timeouts and stale preservation.
- [ ] 2.5 Search service, controller and `GET /currencies/securities`:
  - an in-memory cache (1 h, 500 entries);
  - credit reservation;
  - type mapping (ETF to `etf`, equity to `stock`);
  - currency and ticker filtering;
  - `available: false` without a key, on failure, or when the budget is spent;
  - a per-user rate limit.

  Add tests.

## 3. Valuation and holdings paths

- [ ] 3.1 `holdingValuation.ts`: allow the `market` source for linked stock/ETF. Unit tests cover linked, unlinked, override, missing, currency mismatch and rate failure.
- [ ] 3.2 `holdings.read.service.ts`: read the shared quotes with one query, attach `marketQuote` (with `stale`), keep crypto unchanged, and never call the provider. Add tests.
- [ ] 3.3 `holdings.update.service.ts`:
  - listing fields are immutable;
  - reject unlinked duplicates;
  - allow clearing the manual price of linked holdings;
  - after the commit, a best-effort refresh of newly auto-priced linked listings only. A quantity-only edit makes no refresh.

  Add tests.
- [ ] 3.4 `POST /accounts/:id/holdings/refresh` (ownership-scoped): refreshes the account's due listings and returns the holdings body. Add controller and route tests.

## 4. API surfaces

- [ ] 4.1 `/v1`: add `GET /v1/currencies/securities` (read scope). Update the route tests and `docs/PUBLIC_API.md`.
- [ ] 4.2 MCP:
  - add the `search_securities` read tool;
  - add the listing fields to `update_holdings`;
  - update the tool lists and tests.

## 5. Web

- [ ] 5.1 `currencies.client.ts` gets `searchSecurities`, and the accounts client gets `refreshHoldings`. Add a `useSecuritySearch` hook (300 ms debounce, stale responses ignored) with msw tests.
- [ ] 5.2 `SecuritySearch.tsx` ARIA combobox: results, loading, empty and unavailable states, and "Enter ticker manually". Add tests, including keyboard navigation.
- [ ] 5.3 `HoldingsTab.tsx` and `holdingsDraft.ts`:
  - search on new stock/ETF rows (which sets the kind);
  - Price source for linked rows;
  - saved rows show symbol, exchange and name;
  - "Twelve Data" source label, with "Last updated" and "Last checked" in the tooltip and a "Stale" tag;
  - one refresh per tab mount without flicker;
  - `price_unavailable` copy.

  Update the tests.

## 6. Docs

- [ ] 6.1 Update `docs/DATA_MODEL.md`, `docs/DOMAIN_LOGIC.md` (linked securities, refresh, budget, stale, licensing), the MCP docs and the README/CLAUDE env tables.
- [ ] 6.2 `SHORT_TERM_ROADMAP.md`: record the approved provider and refresh decision. Mark ST-017 and B-010 complete only after acceptance.

## 7. Verification

- [ ] 7.1 Run `npm run typecheck`, `npm run lint` and `npm run test`, plus the holdings integration suite with testcontainers.
- [ ] 7.2 Run one small, controlled live check with the staging key (at most about 10 credits): search AAPL, then quote AAPL on `XNGS` and check the response shape.
- [ ] 7.3 Do a staging deployment, then a browser smoke test:
  - search and select;
  - save and see a price with its times;
  - reopen the tab and see no new provider call;
  - check override and clear;
  - check that an `XMEX` holding is unavailable;
  - check the manual fallback;
  - check keyboard and mobile use;
  - check that no key appears in network traffic.
- [ ] 7.4 Regression: crypto, cash and `other` holdings, existing unlinked stock/ETF rows, Net contributions and net worth stay unchanged.
