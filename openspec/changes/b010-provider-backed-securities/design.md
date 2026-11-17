# Design

## Context

B-009 (archived `2026-11-16-b009-holdings-and-crypto-prices`, in production since PR #69) provides:
- **`Holding`** (`database/prisma/schema.prisma:251-278`), with these fields: `kind` (`crypto|fiat|stock|etf|other`), nullable `code`, `name` (VarChar 80), `unit`, exact `quantity`, and the manual price trio (`manualUnitPrice`, `manualPriceCurrency`, `manualPricedAt`). Its unique key is `@@unique([accountId, kind, code])`.
- **A derived price source:** `fiat` is `cash`. Any kind with a manual price is `manual`. `crypto` without one is `market`, and stock/ETF/other without one are invalid (`MANUALLY_PRICED_HOLDING_KINDS`).
- **One pure valuation:** `accounts/utils/holdingValuation.ts` `valueHoldings(holdings, accountCurrency, { quote, rate })`. It is called only through `accounts/services/holdings.read.service.ts`, which serves account detail, `listAccounts` and `computeNetWorth`. The `marketQuote` function in that service hard-wires Binance and `USDT`.
- **Binance pricing:** `currencies/providers/binance/binance.client.ts` fetches the full ticker on read, caches it in memory for 60 s, and keeps the last list on failure.
- **Freshness policy:** `valuation-timestamps` shows the last successful update time, with no stale thresholds or badges.
- **Web:** `HoldingsTab.tsx` is a RelatedList inside the account Form View draft. It has a free-text code input and a crypto-only Price source `<select>`, and reuses `ValuationTime`, `ManualPriceCell` and `holdingsDraft.ts`.
- **API surfaces:** `GET`/`PATCH /accounts/:id/holdings`, mirrored on `/v1` and as the MCP tools `list_holdings` and `update_holdings`.
- **Background work:** the only existing background pattern is `syncfyAutoSyncScheduler.ts`, an in-process `setInterval` started in `server.ts`.

`other` holdings already model custom and non-public assets in investment accounts. Each has a free-text name, an optional unit, an exact quantity and a required manual unit price with its currency and date (`HoldingsTab`, shared constants mention "land or a vehicle"). That is why ST-022 is superseded rather than built (see D8).

## Goals / Non-Goals

**Goals:**
- Search, select and identify a stock or ETF listing unambiguously.
- Price it automatically, or manually as an override, through the existing valuation.
- Preserve every B-009 behavior and contract.

**Non-goals:**
- A securities catalog or instrument table.
- Security form views.
- Cost basis, returns, dividends or splits.
- Streaming or real-time guarantees.
- Valuation history.
- Custom-asset additions.
- A multi-provider framework.
- Mutual funds, bonds, options or indices.

## Decisions

### D1. Provider: Twelve Data, optional and server-side

**Evidence:** live calls on 2026-11-16, plus the official pricing and help pages.

- **`/symbol_search?symbol=AAPL`** returns `symbol`, `instrument_name`, `exchange`, `mic_code`, `exchange_timezone`, `instrument_type`, `country` and `currency`.
  - For AAPL it returns NASDAQ/XNGS/USD, BMV/XMEX/MXN, BVC/XBOG/COP, TSX/XTSE/CAD and BCBA/XBUE/ARS (CEDEAR). This shows that symbol alone is ambiguous and the MIC is required.
  - Mexican ETFs appear under their BMV symbol, for example `NAFTRACISHRS` (XMEX, MXN).
- **`/quote?symbol=AAPL&mic_code=XNGS`** returns `currency`, `mic_code`, `datetime`, `timestamp`, `last_quote_at`, `close` and `is_market_open`.
- **`/quote?symbol=AAPL&mic_code=XMEX`** answered "available starting with the Pro or Venture plan". So **BMV prices need a paid plan.** BMV search works without one.
- **`instrument_type` is unreliable for ETF classification.** NAFTRAC is reported as "Common Stock". The user keeps choosing Stock or ETF, and the type is shown only as information.
- **Plans** ([pricing](https://twelvedata.com/pricing), [commercial vs personal](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage)):
  - Basic (free) allows 8 credits/min and 800/day, for **internal non-display use only**.
  - Individual plans are personal and non-commercial. Showing data to other people needs a Business plan with display rights.
  - Third-party summaries list Grow from about $29/mo and Pro from about $99/mo. The figures conflict between sources, so confirm them on the live page before purchase.
  - Redistribution needs an add-on.

**Alternatives considered** (secondary sources, partly unverified):
- **Finnhub:** its terms say plans are strictly personal unless agreed otherwise. Its quote has no currency or exchange, it has no batch quote, and its international data is paid.
- **Financial Modeling Prep:** the free tier is US only and end-of-day, with display rights only on top tiers.
- **Alpha Vantage:** 25 requests/day, and its quote has no timestamp.
- **EODHD:** about $20/mo for all-world end-of-day data. It is the fallback if Twelve Data's BMV cost is unacceptable.

Twelve Data is the only option where one API was **verified** to cover search with MIC and currency, plus quotes with a market timestamp, for both US and BMV.

**Shape:**
- `currencies/providers/twelveData/twelveData.client.ts` has `searchSecurities(q)` and `fetchQuote(symbol, mic)`.
- The key comes from `env.TWELVE_DATA_API_KEY` as an `apikey` header. It is never logged or returned.
- Without a key, search returns `{ available: false, results: [] }` and the scheduler does not start. Stock and ETF then behave exactly as in B-009.

The provider is an implementation detail behind those two functions. There is no adapter interface: one implementation does not justify one. Market-data providers live in `currencies/providers/` next to Binance and Frankfurter. `FinancialProviderAdapter` is for account aggregation and does not apply.

### D2. Minimum persistence on `Holding`, no catalog

```prisma
model Holding {
  // existing fields unchanged
  exchange       String?   @db.VarChar(10)   // ISO 10383 MIC of the listing, e.g. XNGS, XMEX
  quoteCurrency  String?   @db.VarChar(10)   // listing currency from the provider, e.g. USD, MXN
  marketPrice    Decimal?  @db.Decimal(38, 18)
  marketPricedAt DateTime?                   // provider's quote time (last_quote_at), not fetch time
  @@unique([accountId, kind, code, exchange])
}
```

- **Identity** is `(code = provider symbol, exchange = MIC)`. The MIC is an open standard, so the identity survives a provider change, and no provider id column is needed. `name` stores the display name (for stock/ETF it is set from the search result). `quoteCurrency` is the listing's currency, fixed for a listing. It serves the picker display, the stored quote and the default manual price currency.
- **Why store the last quote (`marketPrice`, `marketPricedAt`)?**
  - Unlike Binance (one free call returns every price), stock quotes cost one credit per symbol under an 8/min budget.
  - Quoting on read would make `listAccounts` and net worth slow and rate-limited.
  - Without stored quotes, every deploy would leave holdings "missing" for minutes.

  The quote is denormalized per holding row. Duplicates across accounts are refreshed together by `(code, exchange)`, which is cheaper than a new table.
- **Uniqueness:** Postgres treats `NULL` exchanges as distinct. `holdings.update.service.ts` keeps rejecting a second unlinked `(kind, code)` in the same account, so B-009 behavior is unchanged.
- **Linked** means `kind in (stock, etf)` and `exchange != null`. `exchange`, `code` and `kind` are immutable after creation, like `kind` and `code` today. To switch listing, remove the holding and add a new one.

**Rejected:**
- a `Security` table, whether global or user-owned (the old ST-021);
- a `pricingMode` column (the source stays derived, as in B-009 R6);
- a separate quote cache table.

### D3. Refresh: one in-process scheduler, a credit budget, stored results

`currencies/providers/twelveData/securitiesPriceScheduler.ts` follows the `createSyncfyAutoSyncScheduler` shape and is started and stopped in `server.ts`. Each run works as follows:

1. Load the distinct `(code, exchange)` pairs of linked holdings with **no manual price**, across all users. This is a system job, like Syncfy auto-sync. It reads and writes only quote columns and returns nothing to any user.
2. Quote them one at a time, at most `TWELVE_DATA_CREDITS_PER_MINUTE` (default 8) per minute.
3. On success, `updateMany({ where: { code, exchange, kind: { in: [stock, etf] } }, data: { marketPrice: close, marketPricedAt: last_quote_at } })`. A quote whose currency differs from the stored `quoteCurrency` is rejected and logged by symbol only.
4. On a 429 or other error, the run stops for that minute or skips that symbol, and stored values stay as they are.
5. Overlapping runs are skipped.

**Interval and budget:**
- `SECURITIES_PRICE_REFRESH_INTERVAL_MINUTES` defaults to 60.
- A daily budget of about `pairs × 24` credits must fit the plan. On the free tier that means up to about 33 distinct listings hourly.
- `ponytail:` the scheduler is single-instance like Syncfy's. Upgrade it to a DB lock if the API is scaled out.

**On save:** when `PATCH /holdings` creates a linked holding without a manual price, the update service makes one best-effort `fetchQuote`. A success stores the quote. A failure still saves the holding, which shows `price_unavailable` until the next run.

**Search caching:** an in-memory Map keyed by the normalized query, with a 1 h TTL and at most 500 entries. Requests go through a per-user rate limit (the existing rate-limit middleware from S-002) of 30/min. The query is 1-20 characters (shared Zod). Results are filtered to `type in (Common Stock, ETF, Depositary Receipt, Preferred Stock, REIT)` and to an ISO currency that FlowLedger supports.

### D4. Valuation: reuse `valueHoldings`, widen one gate

- Precedence stays fiat, then manual, then market, then missing.
- `holdingValuation.ts` currently allows `market` only for `kind === "crypto"`. It now also allows linked `stock`/`etf`.
- `holdings.read.service.ts` `marketQuote` branches:
  - crypto keeps Binance and `USDT`, unchanged;
  - linked stock/ETF returns `{ price: marketPrice, currency: quoteCurrency, fetchedAt: marketPricedAt }` from the row, or `unavailable` when `marketPrice` is null.
- Conversion still goes through `getExchangeRate(quoteCurrency, accountCurrency)`, and a failure gives `rate_unavailable`.
- No provider call happens on read.
- Unlinked stock/ETF are unchanged: a manual price is required, and the source is `manual`.
- Clearing the manual price of a linked holding is now allowed and reverts it to `market`. For unlinked holdings it stays rejected.

### D5. Freshness and labeling

- `valuedAt` is `marketPricedAt`, the market's quote time. A Friday close viewed on Sunday shows Friday's time. That conveys real-time, delayed and end-of-day honestly, without knowing the plan's entitlement.
- The source label is "Market (Twelve Data)", and its tooltip says "Delayed or end-of-day market price". Nothing says real-time.
- **No stale flag is added.** This keeps the approved `valuation-timestamps` rule ("no stale thresholds, timers, badges"). The timestamp is the staleness signal. The roadmap's "mark it stale" wording is satisfied by that time staying visible and unchanged after failures. See Open Questions if a visible badge is still wanted.

### D6. API, shared contracts and MCP

- **Shared** (`schemas/currencies.ts` or the existing accounts schema file):
  - `securitySearchQuerySchema`: `{ q: 1-20 chars }`.
  - The `SecuritySearchResult` type: `{ symbol, name, exchange, micCode, country, currency, type }`.
  - `holdingUpsertSchema` gains optional `exchange` (`^[A-Z0-9]{4}$`) and `quoteCurrency` (ISO) on stock/ETF create only. `name` is now allowed on stock/ETF, up to 80 characters.
  - `superRefine` requires a manual price for stock/ETF only when `exchange` is absent.
- **Routes:**
  - `GET /currencies/securities?q=` returns `{ available, results }`.
  - It is mirrored as `GET /v1/currencies/securities`, under read scope.
  - MCP `search_securities` (`readOnlyHint: true`) returns the same body.
  - The `update_holdings` description now explains linked stock/ETF.
  - `list_holdings` is unchanged apart from the new fields in its body.
- **Trust:** the API does not re-verify an MCP- or API-supplied `(code, exchange, quoteCurrency)` against the provider at save time, beyond the best-effort quote. A wrong listing simply never quotes (`price_unavailable`), and a currency mismatch is rejected at refresh. `ponytail:` add verification at save if bad input appears in practice.

### D7. Web

- **`SecuritySearch.tsx`** (`pages/Accounts/components/`) is an ARIA 1.2 combobox: an input, a listbox and `aria-activedescendant`.
  - Arrow, Enter and Escape keys work, as do touch targets of at least 44 px.
  - Each result row shows `SYMBOL · Name`, then `Exchange (MIC) · Currency · type`.
  - Loading, empty ("No matching stocks or ETFs") and error or unavailable states each offer "Enter ticker manually", which falls back to the B-009 free-text input with a required manual price.
- **`useSecuritySearch.ts`:** a 300 ms debounce, aborting stale requests and calling `currencies.client.ts`.
- **`HoldingsTab`:**
  - For stock/ETF rows, the search replaces the code input when the row is new. Selecting a result fills `code`, `exchange`, `name` and `quoteCurrency`.
  - Saved rows show `SYMBOL · Exchange` and the name.
  - The existing Price source `<select>` is extended from crypto to linked stock/ETF ("Twelve Data (automatic)" / "Manual"). Manual opens the existing `ManualPriceCell`, defaulting to `quoteCurrency`.
  - Draft, Save and Discard come from `holdingsDraft.ts` and are unchanged.
- Multiple holdings of the same listing across accounts work naturally. Within one account the unique key prevents duplicates, as for crypto.

### D8. ST-022: covered by B-009 `other` holdings

**Supported today:** a named asset ("Apartment Roma Norte", "Family business 25%", "Land Valle", "Car") in an investment account, valued as quantity × manual unit price. For a single asset, use quantity 1. For an ownership share, use the quantity as the fraction or the unit as "share". Each asset has its own currency and valuation date, counts in Total value and net worth, and is user-isolated.

**Genuine gaps, not built here:**
- no description or notes;
- no category or subtype;
- no valuation history (an update overwrites);
- no cost basis or purchase date;
- no link to a liability such as a mortgage;
- no record separate from the holding.

None is required by the current product direction. They are recorded in the roadmap and `docs/KNOWN_ISSUES.md`, so the roadmap does not claim them as delivered.

## Risks / Trade-offs

- **Licensing (highest):** the free plan is internal non-display and individual plans are personal. FlowLedger shows prices to a few trusted users, and the roadmap anticipates a SaaS model, which needs a Business plan with display rights.
  - *Mitigation:* the feature is off without a key, so release is gated on the approved plan.
- **BMV needs a paid plan.**
  - Until then, Mexican listings can be searched and linked but stay `price_unavailable`, and the user can set a manual price.
  - The UI copy for `price_unavailable` on linked holdings is "Market price unavailable; set a manual price".
- **Credit budget versus growth:** the budget is distinct listings × runs per day.
  - *Mitigation:* dedupe across users, skip manually priced holdings, and make the interval configurable.
  - *Upgrade path:* refresh only while `is_market_open` (or once after close).
- **Cold start:** stored quotes survive restarts, and new holdings are quoted on save.
- **Single instance:** the same caveat as Syncfy.
- **Float conversion:** the provider's price is parsed as a decimal string straight into `Decimal`. FX stays float, as in B-009.
- **Symbol format drift** (for example class shares `BRK.B`): the existing ticker regex accepts `.` and `-`. Results that fail validation are filtered out of search.

## Migration Plan

1. Run one additive migration, `b010_security_listing`, generated by `prisma migrate dev`. It adds four nullable columns and replaces the unique index with `(accountId, kind, code, exchange)`. The new index only relaxes the old constraint, so existing rows are valid. There is no backfill or reset, and no raw SQL.
2. Existing stock/ETF rows have a `null` exchange and stay manual-only with identical values.
3. Deploy with no key, which ships dark and makes no behavior change. Then set `TWELVE_DATA_API_KEY` on the approved plan to enable search and refresh.
4. **Rollback:** unset the key, which brings back B-009 behavior, or revert the code. The extra columns are ignored, and dropping them needs a separately approved migration.

## Open Questions (product-owner approval)

1. The Twelve Data plan for production: a Business plan with display rights, the cost, and whether BMV pricing (Pro or higher) is wanted now.
2. Whether time-only freshness (D5) is acceptable, or a visible "may be outdated" badge is wanted after refresh failures. A badge would amend `valuation-timestamps`.
3. The refresh cadence: hourly by default, or only around market close to save credits.
