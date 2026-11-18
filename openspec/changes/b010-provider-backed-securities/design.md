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

### D1. Provider: Twelve Data (approved 2026-11-17)

The product owner approved Twelve Data over its official HTTPS REST API (no WebSockets), with the existing `TWELVE_DATA_API_KEY`, on the free Basic plan. The earlier comparison (Google Sheets `GOOGLEFINANCE`, rejected because its terms forbid storing and redistributing the data; Marketstack free, rejected because 100 requests/month is below a daily refresh of 10 symbols) is kept in the roadmap history and in commit `40b91cf`.

**Verified facts (official docs, 2026-11-17):**
- `GET /symbol_search?symbol=`: 1 credit per request. It returns `symbol`, `instrument_name`, `exchange`, `mic_code`, `exchange_timezone`, `instrument_type`, `country` and `currency` ([docs](https://twelvedata.com/docs/discovery/symbol-search)).
- `GET /quote?symbol=&mic_code=`: 1 credit per symbol. It returns `close`, `currency`, `timestamp`, `last_quote_at` ("Unix timestamp of last minute candle") and `is_market_open` ([docs](https://twelvedata.com/docs/market-data/quote)).
- Basic plan: 8 credits/min, 800/day ([pricing](https://twelvedata.com/pricing)). The minute quota is restored at the start of each minute, and the daily quota resets at 00:00 UTC ([credits](https://support.twelvedata.com/en/articles/5615854-credits)).
- Authentication: the `Authorization: apikey <key>` header is the recommended method ([docs](https://twelvedata.com/docs/introduction)). The key is never put in a URL.
- Errors: a JSON body `{ code, message, status: "error" }`, where 401 is an invalid key, 403 means the plan lacks access, 404 means not found, and 429 means the credit limit was reached ([docs](https://twelvedata.com/docs/introduction)).
- Live calls: a BMV (`XMEX`) quote is refused on Basic ("available starting with Pro"). `NAFTRACISHRS` is typed "Common Stock".

**Licensing (unresolved for production).** The Basic plan is for personal, non-commercial, internal use. FlowLedger staging and the owner's own use fit that. Showing prices to other users, or any commercial use, needs a plan with display rights. This is recorded as a release gate for production and is not assumed to be permitted.

**Replaceability:** all provider code lives in `currencies/providers/twelveData/`. The rest of the system sees only `(symbol, exchange MIC)` listings, the `SecurityQuote` cache and the `provider: "twelve_data"` label. No generic multi-provider framework is built.

### D2. Minimum persistence: two fields on `Holding`, one shared quote cache, one credit ledger

**`Holding`** gains `exchange String? @db.VarChar(10)` (ISO 10383 MIC) and `quoteCurrency String? @db.VarChar(10)`. The unique key becomes `@@unique([accountId, kind, code, exchange])`. Postgres treats `NULL` exchanges as distinct, so the update service also rejects a second unlinked `(kind, code)`. A `stock`/`etf` with an `exchange` is *provider-linked*. The listing fields are create-only and immutable.

**`SecurityQuote`**: one row per listing, shared across all accounts and users. It is public market data, not user data, so it has no `userId`, and it is never returned except through an owned holding.

| Column | Meaning |
|---|---|
| `symbol`, `exchange` (composite id) | The listing |
| `currency` | Quote currency reported by the provider |
| `price` `Decimal(38,18)?` | Last valid price, parsed from the decimal string |
| `quotedAt` | When the price applies: the provider's `last_quote_at`, else `timestamp` |
| `checkedAt` | Last successful provider response ("Last checked") |
| `marketOpen` | `is_market_open` at `checkedAt` |
| `failedAt`, `failureReason`, `failureCount` | Last failed attempt and its consecutive count |
| `nextAttemptAt` | Earliest next provider call, which doubles as the claim lease (D3) |

This is a cache, not a catalog. It holds no names or types, it is filled only for listings someone holds, and deleting it loses only cached prices.

**`ProviderCreditWindow`** (`provider`, `kind` = `minute`|`day`, `windowStart`, `used`): the shared credit ledger, so restarts and several processes draw on one budget. Rows older than two days are deleted on the first reservation of each UTC day.

### D3. Refresh: event-driven, cache-aware, shared budget, no background worker

**Triggers:**
1. Opening an account's Holdings tab. The web app loads the holdings and shows the stored values immediately, then calls `POST /accounts/:id/holdings/refresh` once per tab mount. When anything was refreshed, the response replaces the cached holdings.
2. Saving a change set that creates a linked holding without a manual price, or clears the manual price of one. After the commit, the update service refreshes those listings within a short deadline. A failure never fails the save.

**What does not trigger a refresh:** quantity-only edits, renders, the accounts list, net worth, `/v1`, MCP reads and search. There is no scheduler and no refresh button.

**Eligibility.** A listing is due when it has no quote row, or when `nextAttemptAt <= now` and the holding has no manual price. After a successful check, `nextAttemptAt` is set to:
- `checkedAt + SECURITIES_QUOTE_REFRESH_MINUTES` (default 60) when the market was open;
- `checkedAt + SECURITIES_QUOTE_CLOSED_RECHECK_MINUTES` (default 240) when it was closed. No newer quote is expected then, and the provider's own `is_market_open` is used, so no exchange's trading hours are assumed.

`ponytail:` this uses a fixed closed-market recheck. Use `/market_state` `time_to_open` if overnight or weekend credits matter.

**Claim (deduplication across requests, accounts, users and processes).** The service upserts the row if it is missing, then claims it atomically with `updateMany({ where: { symbol, exchange, nextAttemptAt: { lte: now } }, data: { nextAttemptAt: now + 2 min } })`. Only the caller that updated one row calls the provider. Concurrent callers skip the listing and return the stored value. A crash leaves at most a 2-minute lease.

**Credit reservation.** Before each provider call, one credit is reserved atomically in both the current minute window and the current UTC-day window. The reservation is a conditional `updateMany` with `used <= limit - cost`, so it cannot overshoot. The limits are `TWELVE_DATA_CREDITS_PER_MINUTE` (default 6 of 8) and `TWELVE_DATA_CREDITS_PER_DAY` (default 600 of 800). Search draws on the same ledger.
- When the minute budget is full, the listing is released until the next minute. This is not a failure.
- When the day budget is full, the attempt is recorded as failure `quota_exhausted`, with `nextAttemptAt` at the next 00:00 UTC.

**Failures and backoff.** A failure never touches `price`, `currency`, `quotedAt` or `checkedAt`. It sets `failedAt`, `failureReason`, increments `failureCount`, and sets `nextAttemptAt` as follows:

| Outcome | `failureReason` | Next attempt |
|---|---|---|
| HTTP 429, or a `code: 429` body | `rate_limited` | Start of next minute, and the minute window is marked full for every process. A daily-limit message moves it to the next 00:00 UTC (`quota_exhausted`) |
| 403 (plan lacks access, for example `XMEX`) | `plan_restricted` | 24 h |
| 404, or a missing or invalid `close` | `not_found` / `invalid_quote` | 24 h |
| Currency differs from the holding's `quoteCurrency` | `currency_mismatch` | 24 h (price not stored) |
| Timeout (5 s), network, 5xx, 401 | `unavailable` | min(15 min × 2^(failures−1), 6 h) |

A success resets `failureCount` and clears `failedAt` and `failureReason`.

**Request bound.** One refresh call handles at most the account's due listings, sequentially. Each call is bounded by the 5 s client timeout and stops early when the minute budget is spent. Listings it could not reach stay due for the next trigger.

**Usage.** Each listing costs at most one credit per hour while its market is open and while someone opens it, and about every four hours while the market is closed. With 25 distinct listings opened all day, that is about 7 h × 25 + 4 × 25 ≈ 275 credits per day, well below 600. Search costs 1 credit per uncached query (in-memory cache: 1 h, 500 entries; per-user limit: 30/min).

### D4. Valuation: reuse `valueHoldings`, widen one gate

- Precedence stays fiat, then manual, then market, then missing.
- `holdingValuation.ts` allows the `market` source for linked `stock`/`etf` as well as `crypto`.
- In `holdings.read.service.ts`, `marketQuote` handles two cases:
  - crypto stays on Binance, unchanged;
  - for linked stock/ETF, one `securityQuote.findMany` per read loads the quotes, and the result is `{ price, currency, fetchedAt: quotedAt }`.

  A missing price, or a currency different from the holding's `quoteCurrency`, makes the holding `price_unavailable`. No provider call happens on read.
- Conversion still goes through `getExchangeRate`, and a failure gives `rate_unavailable`. Unlinked stock/ETF are unchanged.
- Each holding is valued once, so Total value and net worth cannot double-count a listing held in several accounts.

### D5. Freshness and stale state

- **Last updated** (`valuation.valuedAt`) is `quotedAt`, the market time of the price. **Last checked** is `checkedAt`. The two are never confused.
- Linked holdings return `marketQuote: { provider: "twelve_data", price, currency, quotedAt, checkedAt, stale, failureReason } | null`, whatever the current source. A manual override therefore still shows the market reference.
- **`stale` is true** when either condition holds:
  - the most recent attempt failed (`failedAt > checkedAt`, or `failedAt` set with no `checkedAt`);
  - at the last check the market was open and `checkedAt − quotedAt > 2 × SECURITIES_QUOTE_REFRESH_MINUTES`. That is an old quote returned by a successful request.

  A closing price while the market is closed is not stale.
- This amends `valuation-timestamps` for security market quotes only. It is an explicit product decision (Open Question 4, approved): a stale quote stays in totals, and only the label changes. Elapsed time since the last check alone still never marks anything stale.
- UI: the source reads "Twelve Data", and "Last updated" and "Last checked" appear in the existing tooltip. When stale, a subtle "Stale" tag appears, with the reason in the tooltip. Nothing claims real-time data.

### D6. API, shared contracts and MCP

- **Shared** (`schemas/currencies.ts` or the existing accounts schema file):
  - `securitySearchQuerySchema`: `{ q: 1-20 chars }`.
  - The `SecuritySearchResult` type: `{ symbol, name, exchange, micCode, country, currency, type }`.
  - `holdingUpsertSchema` gains optional `exchange` (`^[A-Z0-9]{4}$`) and `quoteCurrency` (ISO) on stock/ETF create only. `name` is now allowed on stock/ETF, up to 80 characters.
  - `superRefine` requires a manual price for stock/ETF only when `exchange` is absent.
- **Routes:**
  - `POST /accounts/:id/holdings/refresh` (owned account only) refreshes the account's due listings (D3) and returns the same body as `GET /accounts/:id/holdings`. It is web-only, and not on `/v1` or MCP, so those stay read-only and free.
  - `GET /currencies/securities?q=` returns `{ available, results }`.
  - It is mirrored as `GET /v1/currencies/securities`, under read scope.
  - MCP `search_securities` (`readOnlyHint: true`) returns the same body.
  - The `update_holdings` description now explains linked stock/ETF.
  - `list_holdings` is unchanged apart from the new fields in its body (`exchange`, `quoteCurrency`, `marketQuote`).
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
  - The existing Price source `<select>` is extended from crypto to linked stock/ETF ("Twelve Data (automatic)" / "Manual"). Selecting a result also sets the row kind from the result type (`ETF` is `etf`, other equity types are `stock`). Manual opens the existing `ManualPriceCell`, defaulting to `quoteCurrency`.
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

- **Licensing (production gate):** the Basic plan covers personal, internal use only. Production display to other users needs a display-rights plan (D1).
- **BMV needs a paid plan:** Mexican listings can be searched and linked, but quotes return `plan_restricted`. They show as missing ("Market price unavailable; set a manual price") and are retried once a day.
- **Shared Twelve Data account:** if the same key or account is also used elsewhere, the provider's 429 responses are handled (D3), and the defaults leave 25% headroom.
- **Search spends credits:** debouncing, the cache and the per-user limit bound it, and a full budget returns `available: false`.
- **Float conversion:** prices are parsed as decimal strings into `Decimal`. FX stays float, as in B-009.

## Migration Plan

1. Run one additive migration, `b010_security_quotes`, generated by `prisma migrate dev`. It adds two nullable `Holding` columns, widens the unique index, and creates `SecurityQuote` and `ProviderCreditWindow`. There is no backfill and no raw SQL.
2. Existing stock/ETF rows have a `null` exchange and stay manual-only.
3. Without `TWELVE_DATA_API_KEY`, search returns `available: false` and refresh is a no-op, so B-009 behavior is unchanged.
4. **Rollback:** unset the key or revert the code. The new tables and columns are ignored.

## Decisions taken (2026-11-17)

1. **Provider:** Twelve Data Basic, REST only.
2. **Licensing:** personal and staging use now. A display-rights plan is required before production use by other users (an open release gate).
3. **BMV:** searchable and linkable, priced manually until a paid plan is approved.
4. **Stale label:** approved, as defined in D5, amending `valuation-timestamps`.
5. **Refresh:** event-driven with a shared cache, replacing the scheduled worker.
