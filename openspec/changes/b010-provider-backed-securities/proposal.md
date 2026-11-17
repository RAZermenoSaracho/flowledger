# Proposal

## Why

B-009 already stores `stock` and `etf` holdings, but only with a manually entered ticker and price. The old B-010/B-011 plan added a local securities catalog (ST-021), a separate custom-asset model (ST-022) and, later, a market-data feed (ST-017). That is three pieces of work where one is enough:
- A catalog would copy data the provider already serves.
- B-009 `other` holdings already cover custom and non-public assets.

This change makes stock and ETF holdings work like crypto holdings. The user searches the provider, picks a listing, enters a quantity, and chooses automatic or manual pricing. The holding then stores only the few fields needed to identify, display and price that listing.

## What Changes

- **Instrument search (new):** `GET /currencies/securities?q=` searches stocks and ETFs through Twelve Data on the server and returns symbol, name, exchange, MIC, country, currency and instrument type. It is mirrored as `GET /v1/currencies/securities` and the MCP read tool `search_securities`. The provider API key never reaches the browser.
- **Holding fields (small additive migration):** `Holding` gains:
  - `exchange` (ISO 10383 MIC, for example `XNGS`, nullable);
  - `quoteCurrency` (the listing's ISO currency);
  - the last automatic quote, `marketPrice` and `marketPricedAt`.

  `name` (already present) carries the instrument's display name. The unique key adds `exchange`, so AAPL on NASDAQ (USD) and AAPL on BMV (MXN) can sit in the same account.
- **Provider-linked stock/ETF holdings:** a stock or ETF holding with an `exchange` is provider-linked.
  - With no manual price, its source is `market`, valued from its stored last quote.
  - A manual price still overrides the quote, exactly as for crypto.
  - Holdings without an exchange, including every existing B-009 row, stay manual-only with no behavior change.
- **Price refresh:** an in-process scheduler, following the existing Syncfy scheduler pattern, refreshes the distinct linked listings at a configurable interval, within a configurable per-minute credit budget. A new linked holding is also quoted once when saved (best effort). On failure the stored quote is never cleared or overwritten, and a manual price is never touched.
- **Valuation:** the existing `valueHoldings` precedence (manual, then market, then missing) is reused. Stock and ETF market quotes are read from the holding row, so reads never call the provider. The existing FX conversion turns the quote currency into the account currency. The partial-valuation and no-zero rules are unchanged.
- **Freshness:** the valuation time is the provider's own quote time (`last_quote_at`), not the fetch time. The source label is "Market (Twelve Data)" and never claims real-time. Following `valuation-timestamps`, no stale flags or thresholds are added: the market timestamp shows a delayed, end-of-day or old quote for what it is.
- **Web:** in the Holdings tab, choosing Stock or ETF shows a debounced, keyboard-accessible security search instead of the free-text ticker input. Results show the symbol, name, exchange and currency. A "Price source" selector (automatic/manual) works as it does for crypto, and a manual-ticker fallback covers unavailable search or unlisted securities. Save and Discard are unchanged.
- **Feature off without a key:** if `TWELVE_DATA_API_KEY` is absent, search reports that it is unavailable and stock/ETF holdings stay manual exactly as today.

**Not changing:** no securities catalog table, no instrument master, no second valuation engine, no new account or holding kind, no change to crypto, cash, `other`, Net contributions, ledger or net-worth semantics, and no streaming.

## Roadmap mapping

| Original | Now |
|---|---|
| ST-017 (stock/ETF market data) | Delivered by this change (B-010) |
| ST-021 (public securities catalog) | Superseded: provider search plus listing identity on the holding replace the catalog. Its search-select and exchange-disambiguation criteria are delivered here, while the catalog record and security form view are dropped |
| ST-022 (custom and non-public assets) | Superseded: satisfied by B-009 `other` holdings, with the gaps listed in the roadmap |
| B-011 | Retired: folded into B-010 |

## Capabilities

### New Capabilities
- `security-holding-prices`: provider search, listing identity, scheduled automatic quotes, override precedence, failure and fallback behavior for stock/ETF holdings.

### Modified Capabilities
- `account-holdings`: listing identity (`exchange`, `quoteCurrency`, display `name`) on stock/ETF, uniqueness including the exchange, and a market source for provider-linked stock/ETF.
- `crypto-holding-prices`: the scope sentence that says stock/ETF are manual only now defers to `security-holding-prices`.
- `public-rest-api`: allowlist gains `GET /v1/currencies/securities`.
- `mcp-personal-tools`: adds `search_securities`, and `update_holdings` accepts listing fields.

## Impact

- **Database:** one additive Prisma migration, with four nullable columns and the unique key widened. No backfill and no reset.
- **API:**
  - `currencies/providers/twelveData/` (client plus refresh scheduler);
  - `currencies` route, controller and service for search;
  - `accounts` holdings util, services and MCP descriptions;
  - `server.ts` (start/stop the scheduler);
  - `config/env.ts` and `.env.example` (three optional variables).
- **Shared:** search query and result schemas, and the holding upsert fields.
- **Web:** `HoldingsTab`, a new `SecuritySearch` component, a `useSecuritySearch` hook, the client call and draft utils.
- **Docs:** `DATA_MODEL.md`, `DOMAIN_LOGIC.md`, `PUBLIC_API.md`, MCP docs, `.env.example`.
- **Cost and licensing:** see the provider section in `design.md`. The production plan choice needs product-owner approval before release.
