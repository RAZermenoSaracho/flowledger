# Design

## Context

See `proposal.md`, section Why. This section covers only the facts that shape the approach.

- **Balances:**
  - Account balances come from one calculation: `calculateAccountBalance` (`transactions/utils/transactionCalculations.ts`), using exact `Prisma.Decimal` and ST-023 applied amounts.
  - `listAccounts` (`accounts/services/read.service.ts`, via `withAccountBalances`) calls it.
  - `computeNetWorth` (`reports/services/financialOverview.service.ts`) also calls it directly. It converts each balance with `valueInCurrency(amount, getExchangeRate(...))` and handles each failure separately (`Promise.allSettled` → `excluded`, `partial`).
- **Account types:**
  - `AccountType` has no crypto value.
  - `investment` is only a label, and it triggers the `investment_recorded_balance` disclosure.
  - Local staging has 0 `investment` accounts and one crypto-currency `checking` account. Production was not inspected.
- **Crypto prices:**
  - `currencies/providers/binance/binance.client.ts` fetches `/api/v3/ticker/price` into a `Map<symbol, number>`, with a 60 s cache and no fallback to earlier data. It throws on failure.
  - `getCryptoUsdtPrice` tries `{CODE}USDT`, then `1/USDT{CODE}`, and returns `null` when neither exists. USDT and USD are both 1.
  - The ticker endpoint carries no timestamp. The only honest timestamp is our own fetch time.
- **Precision:**
  - `decimalAmountSchema` (20 integer + 18 fraction digits, strings only), `exceedsCurrencyPrecision`, and `currencyFractionDigits` (ISO currencies use their minor units, other codes 18) already exist in `@flowledger/shared`.
  - `serialize()` keeps named native-amount keys as exact strings and turns other Decimals into numbers.
- **Web:**
  - The account view (`pages/Accounts/AccountDetailPage.tsx`) builds `FormViewTab[]`, with conditional tabs (`credit_card` → `CreditCardTab`).
  - `RelatedList` can host `EditableField` cells. `TransactionSharingTab` is the existing example of child rows edited inside the parent draft and saved by the parent Save.
- **MCP and `/v1`:** both wrap the same services (`mcp/controllers/tools.*.controller.ts`, `v1/v1.routes.ts`).

## Goals / Non-Goals

**Goals:**
- Keep one valuation function that produces both the account aggregate and its net-worth contribution.
- Never count an account twice.
- Never represent an unknown value as 0.
- Keep quantities exact.

**Non-Goals:**
- An instrument or securities table (B-010).
- Stock pricing (B-011).
- Synced quantities (B-012, B-013, B-014).
- Cost basis, returns, valuation history, or persisted prices.
- Ledger-level buy and sell transactions.

## Decisions

### D1. Account value: holdings only, with cash as a `fiat` holding. The ledger balance becomes "Net deposited".

For an account with ≥1 holding:
- the account value is Σ holding values;
- the transaction-derived balance is still computed and returned as `netDeposited`, but it never enters net worth.

Accounts without holdings are unchanged.

| Event | How it is recorded | Net deposited | Value | Net worth |
|---|---|---|---|---|
| Deposit from checking | Transfer (existing) | +X | unchanged until the cash holding is edited | −X until the cash holding is edited, then net 0 |
| Withdrawal to checking | Transfer | −X | unchanged until edited | +X until edited, then net 0 |
| Buy 0.01 BTC with 600 USD | Edit holdings: USD −600, BTC +0.01 | unchanged | ≈ unchanged | ≈ unchanged |
| Sell | Edit holdings | unchanged | ≈ unchanged | ≈ unchanged |
| Transfer between two holdings accounts | Transfer, plus holdings edits on both | ± | edits only | 0 |
| External deposit (income) | Income (existing) | +X | edit cash holding | as edited |

Double counting is impossible by construction: each account contributes either its holdings or its ledger balance, never both.

The cost is a temporary *under*-count between a transfer and the holdings edit. This is conservative, visible (the Holdings tab hint, and "Net deposited" shown next to "Value"), and it is the honest consequence of quantities being manual.

**Rejected alternatives:**
- **Holdings + ledger cash.** A purchase would then need a transaction that lowers cash without being an expense, which means a new buy/sell transaction kind and a parallel investment ledger. Without one, every purchase double counts.
- **Holdings-only, with no cash concept.** Uninvested cash would vanish from net worth.
- **Auto-deriving cash = ledger − cost of holdings.** This needs cost basis (out of scope) and would turn market moves into fake cash.

### D2. No instrument table in B-009. A holding identifies its asset by `(kind, code)`.

```prisma
enum HoldingKind { crypto fiat }

model Holding {
  id                  String      @id @default(cuid())
  userId              String
  accountId           String
  kind                HoldingKind
  code                String
  quantity            Decimal     @db.Decimal(38, 18)
  manualUnitPrice     Decimal?    @db.Decimal(38, 18)
  manualPriceCurrency String?
  manualPricedAt      DateTime?
  createdAt           DateTime    @default(now())
  updatedAt           DateTime    @updatedAt
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)
  @@unique([accountId, kind, code])
  @@index([userId])
}
```

For crypto and fiat, the code is the complete identity FlowLedger has today: no names, chains, or contracts exist anywhere. An `Instrument` table holding only `(kind, code)` would be a speculative table with no independent data. It would also force the B-010 ownership question (global vs user-owned) now.

`userId` is denormalized onto the holding, as on `Transaction`, so every query scopes with `where: { userId, ... }`.

**B-010 path:** it creates `Instrument` once securities and custom assets bring real metadata (ticker, exchange, name, valuation method), and adds `kind` values `security` and `custom`. Holdings then move onto `instrumentId`. Pre-production policy allows a simple backfill: one instrument per distinct `(userId|global, kind, code)`, then drop `code`. Alternatively, B-010 keeps `code` for `crypto`/`fiat`. That choice is B-010's.

**Rejected:** an `Instrument` table with `kind` now. It was the roadmap hypothesis, but it is rejected until it has a second field.

### D3. Identity and precision

- **Codes:**
  - `fiat` codes must be ISO 4217 (`Intl.supportedValuesOf("currency")`, already used by `currencyFractionDigits`).
  - `crypto` codes use `currencyCodeSchema`, upper-cased.
  - A code is not required to exist on Binance. Unknown codes are "unsupported" until the user sets a manual price.
- **Network or contract identity is not modeled.**
  - A token bridged to several chains is economically the same asset, and its price is the same.
  - A *different* token that reuses a Binance-listed symbol would get a wrong market price. The visible "Market (Binance)" source and the manual override are the mitigation.
  - Contract identity belongs to B-013, where on-chain balances need it.
- **Quantity:**
  - Stored as `Decimal(38,18)` and validated by `positiveDecimalAmountSchema`, with `exceedsCurrencyPrecision(qty, code)` for `fiat` (minor units) and 18 digits for `crypto`.
  - It travels as a string. `serialize()` adds `quantity` and `manualUnitPrice` to its native-amount keys.
- **Valuation arithmetic:**
  - The exact value is `Prisma.Decimal(quantity).times(unitPrice).times(rate)`, kept unrounded.
  - The aggregate sums these exact values and rounds once to the account currency's minor units.
  - Each holding's own value is rounded only for its display.
  - Rows may therefore differ from the total by one minor unit. This is accepted, because the total is the authoritative figure.
  - Net worth converts the rounded aggregate, as today's per-account conversion does (`valueInCurrency`).
  - Values travel as decimal strings in the account currency. As in ST-023, they are converted to rounded numbers only for preferred-currency totals.
  - Floats appear only in live rates and Binance prices, as in every existing conversion. They never touch a stored quantity or a stored manual price.

### D4. Valuation precedence and a pure function

A new pure util, `accounts/utils/holdingValuation.ts`, exposes `valueHoldings(holdings, accountCurrency, { quote, rate })`. It returns per-holding valuations and the aggregate. It takes no `now`, because time plays no part in valuation. The rules are applied in this order:

1. `fiat`: price 1 in its own code, source `cash`, with no timestamp. Cash has no price to update, so the UI shows no "Last updated" time for it. A cash holding can be missing only as `rate_unavailable`, when it is held in a currency other than the account's and that conversion fails.
2. `manualUnitPrice`: source `manual`, with price currency `manualPriceCurrency` and `valuedAt = manualPricedAt`.
3. `crypto`: `quote(code)` returns `{ price, currency, fetchedAt }`, giving source `market`, price currency = `quote.currency` and `valuedAt = fetchedAt`. In B-009 the service builds `quote` from `getCryptoUsdtPrice` and `getBinanceTickerFetchedAt` (D5), with currency `USDT`.
4. Otherwise the holding is missing:
   - `unsupported` when the provider doesn't know the symbol;
   - `price_unavailable` when there is no price data;
   - `rate_unavailable` when converting from the price currency to the account currency fails.

`rate(from, to)` is the existing `getExchangeRate`. It is memoized per distinct pair within a call. The aggregate status is `partial` if any holding is missing.

**Response contract** (reused by every future asset class):

```
valuation: {
  source,
  unitPrice,
  priceCurrency,
  valuedAt | null,
  value: string | null,
  missingReason | null
}
```

The same function serves three callers through a new service, `accounts/services/holdings.read.service.ts`. That service loads holdings for one or many accounts in one `userId`-scoped query. The callers are:
- `GET /accounts/:id/holdings`;
- `listAccounts`, which adds one `holding.findMany({ where: { userId } })` to its existing `Promise.all`;
- `computeNetWorth`.

So there is one valuation and one net-worth calculation.

In `computeNetWorth`, an account with holdings contributes `convert(aggregate.value, account.currency, preferred)` in place of its ledger balance. Each missing holding is pushed to `excluded` as `"<name> · <code>"`, which makes the result partial. The known subtotal still counts.

Disclosures:
- `investment_recorded_balance` now applies only to `investment`/`crypto` accounts without holdings.
- `crypto_usdt_as_usd` is added and applies when a market-priced holding is counted.
- No age-based disclosure exists.

### D5. Reuse the existing Binance pricing as-is, with two small additions

**What exists today, verified in code:**
- `fetchBinanceTickerPrices()` (`binance.client.ts`) makes one lazy request for the full `/api/v3/ticker/price` list when a caller needs it.
  - The list is cached in process memory for 60 s, with no persistence and no scheduler.
  - It is refreshed only on demand after the 60 s expire.
  - It throws when a refresh fails. The fetch time is kept internally but never exposed.
- `getCryptoUsdtPrice(code)` returns the asset's USDT price as a number (direct or inverse pair, with USDT/USD fixed at 1), or `null` when Binance has no quote.
- `getExchangeRate(from, to)` converts any crypto/fiat pair, bridging crypto through `getCryptoUsdtPrice` and fiat through Frankfurter.
- No price is persisted anywhere. `Transaction.exchangeRate` is only a write-time snapshot.

**What B-009 reuses, with no new function or cache:**
- `getCryptoUsdtPrice(code)` provides the market unit price, quoted in `USDT`. A `null` result means `unsupported`, and a throw means `price_unavailable`.
- `getExchangeRate("USDT" | manualPriceCurrency | fiatCode, accountCurrency)` provides every conversion. A throw means `rate_unavailable`.

**What is genuinely missing, and the smallest addition for each:**
1. **The price timestamp.** Add `getBinanceTickerFetchedAt(): Date | null` to `binance.client.ts`. It reads the existing cache's `fetchedAt`, and the result becomes `valuedAt` for market valuations.
2. **Keeping the last known price.** When a refresh fails and a cached list exists, `fetchBinanceTickerPrices()` returns the cached list and leaves its `fetchedAt` unchanged, instead of throwing. It still throws when nothing has ever been fetched.

   This is a change to the one existing cache, not a parallel snapshot. It applies the approved freshness policy ("a known price remains the last known price until replaced") to every crypto consumer:
   - account balances in the preferred currency;
   - reports;
   - net worth;
   - debts;
   - rate suggestions.

   During a Binance outage, these now use the last known crypto price instead of failing or excluding the item. Fiat (Frankfurter) behavior is unchanged.

**Rejected alternatives:**
- **New `getCryptoQuote` and `getBinanceTickerSnapshot` functions with a holdings-only fallback**, as in the previous draft. These would be a second quote API and a second cache path over the same data.
- **Storing price strings in the cache.** This means churn for no authoritative gain, because quantities stay exact and valuations are derived and rounded.
- **Persisting prices, adding a scheduler, or adding a new provider.** No missing capability requires any of them.

A manual unit price is an **asset valuation entered by the user**, not an exchange rate. It is consistent with Milestone 14, which forbids storing *rates* on accounts.

### D6. USDT and the conversion infrastructure

Holdings code never assumes USD. A market price is displayed in `USDT`, which is what `getCryptoUsdtPrice` returns, and it is converted with `getExchangeRate("USDT", accountCurrency)`. The existing layer treats USDT as 1 USD. That assumption stays confined to `getCryptoUsdtPrice`, which already applies it to every crypto conversion today. Future providers declare their own quote currency.

USDT normally trades within about ±0.5% of USD. It can depeg, as in May 2022, when it briefly traded near 0.95. This is disclosed through the "Market (Binance, USDT = USD)" source label and the `crypto_usdt_as_usd` disclosure.

### D6a. Timestamp presentation (`valuation-timestamps`)

- **Formatting:** a `formatValuationTime(iso)` helper sits in `apps/web/src/utils/dateTime.ts`. It uses the same `toLocaleString` options as `formatTransactionDate`: device time zone and locale, date, hours and 2-digit minutes. The UI renders the result as "Last updated: <formatted>".
- **Tooltip component:** a small `ValuationTime` component wraps the price.
  - The trigger is a `<button type="button">` showing the price, with `aria-describedby`.
  - The tooltip opens on hover, focus and tap, and closes on blur, on outside tap and on Escape, through the existing `useDismiss` hook.
  - In stacked mobile rows, the timestamp is shown as a small secondary text line instead.
  - No new dependency is added.
- **Location:** the component lives in `pages/Accounts/components/` because only one page module uses it so far, per `apps/web/CLAUDE.md`. It moves to `src/components/` when B-010 or B-011 adds a second consumer.
- **Reuse:** the policy itself is reusable through the `valuation-timestamps` spec and the `valuedAt` response field.

### D7. API shape: GET, plus an atomic PATCH change set

`PATCH /accounts/:id/holdings` takes `{ upsert: HoldingUpsert[], remove: string[] }` and is validated by `holdingsChangeSetSchema` in `packages/shared/src/schemas/accounts.ts`. Each `HoldingUpsert` is `{ id?, kind?, code?, quantity?, manualUnitPrice?: string|null, manualPriceCurrency?, manualPricedAt? }`. A create needs `kind`, `code` and `quantity`. An update forbids `kind` and `code`.

`holdings.update.service.ts` runs these steps in one `prisma.$transaction`:
1. Load the account with `findFirst({ where: { id, userId } })` and check that its type is eligible.
2. Check that every referenced id belongs to `{ accountId, userId }`; otherwise return `notFound()`.
3. Apply the changes. Unique violations map to a 400.
4. Re-read the holdings.

This one write endpoint serves three clients:
- the web draft (send changed, new, and removed rows);
- `/v1`;
- MCP.

Omitted rows are untouched, so a partial MCP call is safe.

**Rejected alternatives:**
- **Per-row POST/PATCH/DELETE.** The web Save would then be a non-atomic loop.
- **PUT that replaces the whole set.** An MCP client that omits rows would delete them.

The type-change guard lives in `accounts/services/update.service.ts`: it rejects a non-eligible type when `holding.count({ where: { accountId, userId } }) > 0`.

### D8. Web: a Holdings tab inside the account Form View draft

- **Draft:** `values.holdings` joins the account draft, following the `TransactionSharingTab` pattern: `draftId` keys and a `RelatedList` with `EditableField` cells. On Save, the page sends the account `PUT` if account fields are dirty, then the holdings `PATCH` if holdings are dirty.
  - If the second call fails, the draft keeps the holdings changes and shows the error. The account change already saved, which is acceptable because the two are independent.
- **Components:** `pages/Accounts/components/HoldingsTab.tsx`, `hooks/useAccountHoldings.ts`, and `services/accounts.client.ts` additions.
- **Display:** values are rendered with `formatMoney`, and quantities with exact string formatting. There is no web-side arithmetic.
- **Account values:** the header and the accounts list read `holdingsValuation`.
- **Labels and disclosures:** `accountDisplay.ts` gains the `crypto` label, and `FinancialOverviewSection`'s `DISCLOSURE_TEXT` gains the two new codes.

### D9. Scope guard (ponytail pass)

These were cut, each with the batch that would add it:

| Cut | Added when |
|---|---|
| Instrument table | B-010 |
| A holding detail page (inline is enough) | When a holding has more fields than one row |
| Persisted prices | Outage-after-restart becomes a real complaint |
| Valuation history and returns | A returns intent |
| Network field | B-013 |
| Stale thresholds, badges or timers | Never. This is rejected by the freshness policy, `valuation-timestamps` |
| Separate POST/DELETE endpoints | Never needed, PATCH covers them |

## Risks / Trade-offs

- **Net worth dips between a transfer and the holdings edit.**
  - *Mitigations:* the hint on the Holdings tab, and "Net deposited" shown next to "Value". This is documented in `DOMAIN_LOGIC.md`.
  - *Upgrade path:* a future buy/sell or "sync cash from transfer" action.
- **Symbol collision, where a non-Binance token shares a listed symbol.**
  - *Mitigation:* the visible source label and the manual override.
  - *Full fix:* contract identity in B-013.
- **No last known price when a fresh process starts during a Binance outage.** This happens only during a deploy or restart that coincides with an outage.
  - *Mitigation:* holdings show "Value missing" and net worth shows the known subtotal labeled partial, never zero. A manual price covers it.
  - *Upgrade path:* persist the last quotation per holding, with no contract change.
- **Binance HTTP 451 or region blocking on the production host.**
  - Pricing already depends on this for crypto currencies. In that case everything degrades to missing or manual. Verify the host can reach Binance during acceptance.
- **USDT depeg:** this is disclosed. The USD treatment lives only in the existing conversion layer (D6).
- **Old prices look current.** Without time-based rules, a price that is a year old counts like a fresh one. This is the intended policy. The "Last updated" time is the user's signal.
- **Float rates:**
  - Rates and Binance prices pass through JavaScript numbers, as all existing conversions do.
  - Quantities and stored prices never pass through floats.
  - Derived values are rounded to minor units.
- **`listAccounts` latency:** it gains one indexed query, plus the cached ticker and rates. Accounts without holdings pay nothing extra.
- **MCP tool count:** the "Write credential tool list" scenario, currently 20 tools, rises by two. Update `mcp-personal-tools` tests and the archived count when archiving.

## Migration Plan

1. Add the additive Prisma migration `b009_holdings`: `ALTER TYPE "AccountType" ADD VALUE 'crypto'`, plus the `HoldingKind` enum and the `Holding` table with its foreign keys, unique key, and index. It is generated by `prisma migrate dev`. No raw SQL, no backfill, and **no reset**: nothing existing changes meaning, because accounts without holdings behave as before.
2. Deploy through the normal flow. The migration is applied by the existing deploy step.
3. **Rollback:** revert the code. The table and enum value are unused when the code is reverted. Dropping them would be a separate, explicitly approved migration.
4. **Production check before release (read-only):** `investment` accounts are unaffected until holdings exist, so no data action is required.
