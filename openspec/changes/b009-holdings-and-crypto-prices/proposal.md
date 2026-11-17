# Proposal

## Revision after manual review

Manual review of the first implementation changed the valuation model. This revision supersedes the earlier text wherever they conflict:
- Investment and crypto accounts are **always** valued from holdings. An account with no holdings is worth 0 (status `empty`). The transaction-derived balance, and the "Net deposited" concept, no longer appear in valuation, net worth or the UI for these types.
- Holdings gain three kinds beyond `crypto` and `fiat` (Cash): `stock`, `etf` and `other` (name plus optional unit). Stock, ETF and other assets are priced manually only. Crypto accounts accept crypto holdings only, enforced server-side.
- The Holdings UX is reworked: a Total value header, an Add Holding flow, a price source selector and a compact integrated money input.
- Stored data that no longer fits (for example cash in a crypto account) is kept and valued, never deleted.

## Why

Today `investment` is only a label. An investment or crypto account's value is its transaction-derived balance, so net worth counts these accounts "at recorded balance, not market value". Users can't record what they actually hold: 0.5 BTC, 3 ETH, or 250 USD of uninvested cash. B-009 (ST-015 + ST-016) adds manually maintained holdings with honest valuations. It counts them in the **one existing** net-worth calculation, and it prices supported crypto from the Binance feed FlowLedger already uses, with no new provider, scheduler, or cache.

## What Changes

**ST-015: holdings and manual valuations**
- A new `Holding` table. Each row is one position in one account: `kind` (`crypto` | `fiat` | `stock` | `etf` | `other`), `code` (for example `BTC` or `USD`), an exact `quantity` (`Decimal(38,18)`), and an optional manual valuation (unit price, its currency, and its timestamp). Each instrument appears at most once per account. The same instrument can be held in other accounts with separate quantities.
- A new account type, `crypto`, is added (additive enum value). Holdings are allowed only on `investment` and `crypto` accounts; `crypto` accounts accept crypto holdings only.
- **Valuation rule for accounts with holdings:**
  - The account's value is always the sum of its holdings' values, in the account currency, and 0 with status `empty` when there are none.
  - Uninvested cash is a `fiat` holding.
  - The transaction-derived balance never counts as the value of an investment or crypto account. Other account types are unchanged.
- **Valuation source precedence:** a manual override wins, then an available market quotation (ST-016), then "missing".
  - `fiat` holdings are valued at par.
  - Each price keeps its original currency, and values are converted into the account currency through the existing `getExchangeRate`.
  - A missing value is never shown as zero. The known subtotal is shown, labeled partial, and the missing holding is named with its reason.
  - Currency rounding happens only at the display and aggregation boundaries.
- **API:**
  - `GET /accounts/:id/holdings` returns the holdings with their valuations and the account aggregate.
  - `PATCH /accounts/:id/holdings` applies an atomic `{ upsert, remove }` change set.
  - Both are mirrored on `/v1`, and as the MCP tools `list_holdings` and `update_holdings`.
- `GET /accounts` adds a `holdingsValuation` summary, non-null for every investment and crypto account and `null` for other types.
- **Net worth:** `GET /reports/financial-overview` uses the same holdings valuation for those accounts. Investment and crypto accounts contribute their holdings value (0 when empty). The new `investment_without_holdings` disclosure replaces `investment_recorded_balance`, which is no longer emitted. `crypto_usdt_as_usd` is also added.
- **UI:**
  - A "Holdings" tab on `investment` and `crypto` accounts. It is an editable RelatedList inside the account Form View draft, saved with the same Save button. It shows each holding's quantity, unit price in its original currency, value, source, and a "Value missing" state. The last-updated time appears as an accessible tooltip, or as a small secondary label where there's room.
  - The account header and the accounts list show the aggregate as "Total value", with no second total.
- Changing an account with holdings to a non-eligible type is rejected. Deleting an account cascades to its holdings.

**ST-016: automatic crypto prices**
- **Reuses the existing pricing as-is.** A `crypto` holding with no manual price is valued with the existing `getCryptoUsdtPrice(code)`, which reads the existing ticker client and its 60 s in-memory cache. The price is quoted in `USDT` and converted with the existing `getExchangeRate`. That conversion already treats USDT as USD, and this is disclosed. No valuation code assumes USD.
- **Two small additions to the existing Binance client**, with no new quote API, cache, scheduler or persistence:
  - `getBinanceTickerFetchedAt()` exposes the cache's existing fetch time. It becomes the "Last updated" time.
  - When a refresh fails, the client keeps serving the last successfully fetched list with its original time, instead of throwing. This applies the freshness policy to every crypto consumer. It still throws if nothing has been fetched yet.
- If a code is unsupported or no snapshot exists, the holding is "missing". It is never shown as zero.
- Quantities stay manual. Clearing a manual price switches the holding back to the market price.

**Freshness policy (reusable):** each valuation keeps the time of its last successful update and shows it unobtrusively. The format is "Last updated: <date time>", in the device's time zone, using the app's existing date-time convention. It is reachable by hover, focus and tap. There are no stale thresholds, timers, badges or warning colors.

**Not changing:** no instrument or securities catalog table, no cost basis or returns, no Binance account or wallet sync, no scheduler, no persisted prices, no new dependency.

## Capabilities

### New Capabilities
- `account-holdings`: holdings on eligible accounts, including the data rules, valuation precedence and currency, missing values, the aggregate value with boundary rounding, API, permissions and isolation (ST-015).
- `crypto-holding-prices`: automatic Binance market valuation of crypto holdings, including override precedence, the original quotation currency, the last known price, and unavailable or unsupported handling (ST-016).
- `valuation-timestamps`: the general, reusable freshness policy, covering the preserved last-update time, no time-based rules, known versus missing, and accessible presentation.

### Modified Capabilities
- `financial-overview`: net worth counts holdings value for investment and crypto accounts, and the disclosures change (`investment_without_holdings` replaces `investment_recorded_balance`, and `crypto_usdt_as_usd` is added).
- `account-form-view`: a Holdings tab for `investment` and `crypto` accounts, and the aggregate value in the header.
- `public-rest-api`: the allowlist gains `GET` and `PATCH /v1/accounts/:id/holdings`.
- `mcp-personal-tools`: the `list_holdings` and `update_holdings` tools are added.

## Impact

- **Database:** one additive migration, `b009_holdings`, plus a second additive revision migration. Together they add `AccountType.crypto`, the `HoldingKind` enum (`crypto`, `fiat`, `stock`, `etf`, `other`), and the `Holding` model (cascade on account and user) with nullable `code` and optional `name` and `unit`. No reset or backfill is needed: local staging has no `investment` accounts, and existing accounts are unaffected until holdings are added.
- **API:**
  - `accounts`: a new holdings util, services, controller and routes, a type-change guard, and `listAccounts` enrichment.
  - `currencies`: `binance.client.ts` only, which gains `getBinanceTickerFetchedAt()` and serves the last known list on a failed refresh.
  - Also affected: `reports/financialOverview.service.ts`, `mcp`, and `v1`.
- **Shared:** holding schemas and types, the `crypto` value in `ACCOUNT_TYPES`, one disclosure code, and the `holdingsValuation` shape on accounts.
- **Web:** the account detail page gets a Holdings tab and a header value, and the accounts list shows the value. `FinancialOverviewSection` gets disclosure texts, and the type labels gain `crypto`.
- **Docs:** `DATA_MODEL.md`, `DOMAIN_LOGIC.md`, `PUBLIC_API.md`, the MCP docs, and `docs/KNOWN_ISSUES.md` for deferred items.
