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

### D1. Provider: pending approval; recommended Twelve Data Basic (free) for US, manual for BMV

**Status:** not approved. The design is provider-neutral (D2, D4): listing identity is `(symbol, MIC)`, and the provider sits behind two functions, `searchSecurities(q)` and `fetchQuote(symbol, mic)`, in `currencies/providers/<provider>/`. Choosing a provider changes only that folder and the env vars.

**Evaluation (2026-11-16/17).** Each row is marked as verified (V), inferred (I) or unverified (U).

| | Google Sheets `GOOGLEFINANCE` | Marketstack free | Twelve Data Basic (free) |
|---|---|---|---|
| Cost | $0 (a GCP service account) | $0 | $0 |
| Official API | **No.** It is a sheet function with no API contract or SLA (V) | Yes, REST (V) | Yes, REST (V) |
| Quota | Sheets API: 300 reads/min per project. One batch read covers every symbol (V) | **100 requests/month, and each symbol in a batch counts as one** (V) | 8/min, 800/day (V) |
| US stocks / ETFs | Yes, delayed up to 20 min (V) | Yes (I) | Yes. Live quote verified (V) |
| BMV stocks / ETFs | Listed, 20-min delay (V). Ticker format untested (U) | Not documented (U) | Search yes. **Quotes need Pro or Venture** (V) |
| Search | **None** (no name or exchange attributes) (V) | `/tickers?search=` with MIC (V). Currency undocumented (U) | `/symbol_search` with MIC, currency and type (V) |
| Timestamp / currency | `tradetime`, `currency` (V). Readable via API only for current attributes, not historical ones (V, docs). Untested (U) | EOD date (V). Currency undocumented (U) | `last_quote_at`, `currency` (V) |
| Automation reliability | Recalculation without an open viewer is undocumented (U) | EOD only (V). Key in a URL query parameter (V). v1 deprecated (V) | Documented API (V) |
| Terms | **The Finance disclaimer forbids users to "copy, … store, reproduce, reprocess, transmit or redistribute any data" without consent**, and the data is informational only (V) | "Non-Commercial Use" on free. Display terms not found (U) | Individual plans are personal and non-commercial. Basic is "internal non-display" (V). Whether showing a price in one's own app counts as display is unclear (U) |

**Conclusions:**
- **Google Sheets** is rejected as a backend source. It works only through an unsupported mechanism, whose terms forbid exactly what FlowLedger does (storing the data and showing it to users), and its recalculation is undocumented. It remains fine for the owner's personal spreadsheet.
- **Marketstack free** is rejected. 10 symbols refreshed once per trading day need about 220 requests a month, more than twice its 100-request quota.
- **Others:**
  - EODHD (20 calls/day) and Alpha Vantage (25/day) are tight, and their BMV coverage on free plans is unverified.
  - Finnhub's terms are personal-only.
  - FMP's free plan is US only.
  - No free source with **verified BMV quotes** was found.
- **Recommendation:**
  - Use Twelve Data Basic, the only free option verified end-to-end for US search and quotes, through an official API.
  - BMV listings can be linked through its search and priced manually.
  - Upgrade paths, each only after approval: Twelve Data Pro (BMV quotes), or EODHD (about $20/mo) after verifying `.MX` coverage with a free key.
- **Licensing caveat:** free plans are personal or non-commercial everywhere, and none clearly grants display rights to other users. That fits FlowLedger's current personal, trusted-user stage. Written confirmation from the chosen vendor, or a display-rights plan, is a release gate if FlowLedger becomes commercial.

**Sources:**
- [GOOGLEFINANCE](https://support.google.com/docs/answer/3093281)
- [Google Finance disclaimer](https://www.google.com/googlefinance/disclaimer)
- [Sheets API limits](https://developers.google.com/sheets/api/limits)
- [Marketstack pricing](https://marketstack.com/pricing)
- [Marketstack documentation](https://marketstack.com/documentation)
- [Twelve Data pricing](https://twelvedata.com/pricing)
- [Twelve Data: commercial and personal usage](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage)
- [EODHD pricing](https://eodhd.com/pricing)

The key is server-side only. Without a key, search returns `{ available: false, results: [] }`, the scheduler does not start, and stock/ETF behave as in B-009. There is no adapter interface while only one provider exists.

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
2. Quote them one at a time, within the provider's per-minute limit (8 on Twelve Data Basic).
3. On success, `updateMany({ where: { code, exchange, kind: { in: [stock, etf] } }, data: { marketPrice: close, marketPricedAt: last_quote_at } })`. A quote whose currency differs from the stored `quoteCurrency` is rejected and logged by symbol only.
4. On a 429 or other error, the run stops for that minute or skips that symbol, and stored values stay as they are.
5. Overlapping runs are skipped.

**Schedule (revised): once per weekday after the close.**
- Delayed or end-of-day prices are acceptable, so the job runs at `SECURITIES_PRICE_REFRESH_UTC_TIME` (default `22:30`, after the NYSE/NASDAQ and BMV closes), Monday to Friday.
- New holdings are quoted once on save.
- There is no market-hours polling, and no on-demand refresh button: stored quotes make reads free, and a manual button would only spend quota.
- Holidays cost one request per listing, and the quote time stays unchanged, so the result is harmless.
- `ponytail:` the scheduler is single-instance like Syncfy's. Upgrade it to a DB lock if the API is scaled out.

**Expected usage.** Each distinct listing costs one request per run, deduplicated across every holding and user. There are about 22 trading days a month.

| Distinct listings | Per day | Per month | Twelve Data Basic (800/day) | Marketstack free (100/mo) |
|---|---|---|---|---|
| 10 | 10 | ~220 | 1% of the daily quota | over the quota |
| 25 | 25 | ~550 | 3% | over the quota |
| 50 | 50 | ~1,100 | 6%, and about 7 minutes at 8/min | over the quota |

Adds on save cost one request each. Search costs one request per uncached query, after a 300 ms debounce and a 1 h cache.

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
- The source label is "Market (<provider name>)", and its tooltip says "Delayed or end-of-day market price". Nothing says real-time.
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

### D9. Local securities catalog: reassessed, still not justified

**Why a bulk catalog is out:** no free source licenses one for both US and Mexican listings.
- The Nasdaq Trader symbol files (which flag ETFs) allow only "personal and non-commercial use". Other uses need written consent ([terms](https://www.nasdaqtrader.com/Trader.aspx?id=CopyDisclaimMain)).
- The SEC `company_tickers.json` is usable with a User-Agent at up to 10 req/s, but it covers US operating companies, not ETFs ([SEC](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data)).
- BMV publishes issuers only as HTML pages, sells its databases ([2026 price list](https://bmv.com.mx/work/models/Grupo_BMV/Resource/1192/10/images/LISTA%20DE%20PRECIOS%20BASES%20DE%20DATOS%202026.pdf)), and no BIVA bulk list was found. Scraping is excluded.
- OpenFIGI is free for on-demand mapping (25 req/min without a key), but its terms were not reviewed.

**Why an on-demand catalog adds nothing:** a catalog filled only by user selections would hold exactly the listing fields that D2 already stores on the holding. Search would still need the provider for anything not yet selected.

**When to reconsider:** if the chosen price source has no search endpoint, as with a Google Sheets bridge, or if two price sources must be combined. A `SecurityListing(symbol, mic, name, type, currency)` table would then be the smallest step. Holdings would keep their own columns, so B-009 contracts are unchanged.

## Risks / Trade-offs

- **Licensing (highest):** the free plan is internal non-display and individual plans are personal. FlowLedger shows prices to a few trusted users, and the roadmap anticipates a SaaS model, which needs a Business plan with display rights.
  - *Mitigation:* the feature is off without a key, so release is gated on the approved plan.
- **BMV needs a paid plan.**
  - Until then, Mexican listings can be searched and linked but stay `price_unavailable`, and the user can set a manual price.
  - The UI copy for `price_unavailable` on linked holdings is "Market price unavailable; set a manual price".
- **Credit budget versus growth:** the budget is distinct listings × one run per weekday. See the usage table in D3.
- **Cold start:** stored quotes survive restarts, and new holdings are quoted on save.
- **Single instance:** the same caveat as Syncfy.
- **Float conversion:** the provider's price is parsed as a decimal string straight into `Decimal`. FX stays float, as in B-009.
- **Symbol format drift** (for example class shares `BRK.B`): the existing ticker regex accepts `.` and `-`. Results that fail validation are filtered out of search.

## Migration Plan

1. Run one additive migration, `b010_security_listing`, generated by `prisma migrate dev`. It adds four nullable columns and replaces the unique index with `(accountId, kind, code, exchange)`. The new index only relaxes the old constraint, so existing rows are valid. There is no backfill or reset, and no raw SQL.
2. Existing stock/ETF rows have a `null` exchange and stay manual-only with identical values.
3. Deploy with no key, which ships dark and makes no behavior change. Then set the approved provider's API key to enable search and refresh.
4. **Rollback:** unset the key, which brings back B-009 behavior, or revert the code. The extra columns are ignored, and dropping them needs a separately approved migration.

## Open Questions (product-owner approval)

1. **Provider:** approve Twelve Data Basic (free, US quotes; BMV search with manual price), or choose another option from D1.
2. **Licensing posture:** accept free personal and non-commercial terms for the current trusted-user stage, with a display-rights plan as the gate before any commercial use.
3. **BMV automatic prices:** defer them (manual for now), or approve a paid source (Twelve Data Pro, or EODHD after a free-key coverage test).
4. **Stale label:** the user asked for stale quotes to be labeled, but `valuation-timestamps` forbids time-based flags. The minimal compliant option is a derived `stale` flag on linked holdings, true when the most recent refresh attempt for that listing failed. It would need one nullable `marketQuoteFailedAt` column and an amendment to `valuation-timestamps`. The alternative is to keep time-only freshness.
