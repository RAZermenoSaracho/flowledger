# Design

## Context

See proposal.md for the motivation. The current state, verified against the code on `razs_ai` at `7fd97a6`:

- **Transfers.** A transfer is one `Transaction` row with `type=transfer`, `accountId` as the source and `transferToAccountId` as the destination, plus one `amount` in `executionCurrency`. `TransactionRelation` is a generic link, not the transfer mechanism.
- **Balances.** `transactions/utils/transactionCalculations.ts#calculateAccountBalance` is the only balance function. It has two callers:
  - `accounts/services/read.service.ts` (via `withAccountBalances`)
  - `reports/services/financialOverview.service.ts`

  It applies `amount.toNumber()` to both sides and ignores currencies.
- **Rate snapshot.** `exchangeRate` and `amountInPreferredCurrency` are a snapshot of the conversion to the preferred currency, from `transactions/utils/transactionCurrency.ts`. The dashboard summary sums `amountInPreferredCurrency`. Both are left unchanged.
- **Write paths.**
  - `createTransaction`, `updateTransaction` and `deleteTransaction` are shared by the web API, `/v1` and MCP.
  - `importProviderImportedTransaction` uses its own `tx.transaction.create`.
  - Settlement approval (`debts/services/update.service.ts#approveSettlement`) has two more direct `tx.transaction.create` calls. Each side is already converted into its account's currency.
- **Decimals.** `serialize()` turns every `Decimal` into a number. `moneySchema` is `z.coerce.number()`. Native columns are `Decimal(12,2)`. `Prisma.Decimal` is available in the API. The web app has no decimal library.
- **Crypto detection.** Crypto is detected only through Binance (async). Fiat is whatever Frankfurter lists, and every Frankfurter code is ISO 4217.
- **Local staging data** (read-only inspection, 155 transactions, 7 accounts in MXN/USD):
  - 13 transactions have an `executionCurrency` that differs from their account's currency.
  - 11 of them predate migration `20260730001648`. Its backfill stamped `executionCurrency='USD'` and rate 1 on every existing row, regardless of the account. Before that migration the form had no currency field, so those amounts are account-native and only mislabeled.
  - 2 rows (2026-07-31 and 2026-08-08) are genuine mismatches.
  - There are 0 cross-currency transfers and no crypto accounts.
  - The 13 rows touch 5 shared expenses, 12 relations and 6 settlement requests.
  - Production was not inspected.

## Goals / Non-Goals

**Goals:**
- One resolver for applied amounts and one balance function, used by every write path and every consumer.
- An exact decimal path from request to Postgres to response, with no float in between.
- A migration that leaves every current balance unchanged.

**Non-Goals:**
- No historical rate store. Suggestions use today's rate, as `exchangeRate` does now.
- No change to report semantics: reports still group by `executionCurrency` and convert at live rates.
- No recomputation of `amountInPreferredCurrency` snapshots.
- No generic audit or event system, and no read UI for corrections. A list endpoint is deferred until a screen needs it.
- No decimal library on the web.

## Decisions

### D1. Two applied-amount columns, not a split-row transfer model

Add `accountAmount` (source/primary account, in its currency) and `destinationAmount` (transfer destination, in its currency). Both are nullable at the database level. The service requires `accountAmount` whenever `accountId` is set, and `destinationAmount` for every transfer. `amount` and `executionCurrency` stay what was executed.

- *Alternative: two rows per transfer (debit and credit legs).* This duplicates transaction logic that sharing, relations, notifications and the UI all assume is one row. Rejected by the ST-023 scope.
- *Alternative: redefine `amount` as account-native and add `executedAmount`.* This changes the meaning of the field read by reports, the snapshot and every client. Rejected.
- *Alternative: store `accountAmount` only when the currencies differ.* This puts a null branch in every consumer. Always persisting it costs nothing, and the backfill fills it exactly.

### D2. Optional `appliedRate`, effective rate derived

`appliedRate` (Decimal(30,18), nullable) holds only a stated rate. When it is null, the record displays an effective rate computed from the persisted amounts:
- a transfer: `destinationAmount / accountAmount`
- otherwise: `accountAmount / amount`

There is no "rate kind" enum, because null means effective. `feeAmount` and `feeCurrency` are both nullable and validated together. `feeCurrency` must be one of the transaction's currencies (execution, source or destination). Fees are a detail only, as the ST-023 invariant requires. Reports keep excluding transfers, so a transfer fee is not reported as an expense. This answers the roadmap's open question: a user who wants the fee as an expense records it as a separate expense.

### D3. One resolver, `transactions/utils/appliedAmounts.ts`

`resolveAppliedAmounts({ type, amount, executionCurrency, account, destinationAccount, stated })` returns `{ accountAmount, destinationAmount }` as `Prisma.Decimal`:
- When the currencies are equal, it copies `amount`.
- When they differ, it uses the stated value, or otherwise `amount × getExchangeRate(from, to)`, rounded to the target currency's precision.
- If no rate is available, it throws a 400 naming the field.

It is called by:
- `createTransaction`
- `updateTransaction`, whenever amount, currency, type, either account, or a stated applied amount changes
- `importProviderImportedTransaction`
- `approveSettlement`, where both sides are same-currency, so the resolver copies

The fee and rate validation lives beside it. The rate fetch goes through the existing `currencies/services/read.service.ts#getExchangeRate`, with no new provider code.

### D4. Balance in `Prisma.Decimal`

`calculateAccountBalance` returns a `Prisma.Decimal` computed as `initialBalance + Σ income.accountAmount − Σ (expense|transfer-out).accountAmount + Σ transfer-in.destinationAmount`. `listAccounts` selects the two new columns. Preferred-currency valuations call `.toNumber()` only after the native sum. `calculateMonthlyCashflow` keeps number output (report totals stay numbers) but sums through `Decimal`.

### D5. Precision rule from `Intl`, shared

`packages/shared` gets:
- `isFiatCurrency(code)`: `Intl.supportedValuesOf("currency")`, which is synchronous and the same in Node 24 and current browsers.
- `normalizeNativeAmount(value, currency)`: fiat rounds half-up to 2 places, otherwise rejects more than 18 decimals.
- `decimalAmountSchema`: a string matching `^-?\d{1,12}(\.\d{1,18})?$`, or a finite number whose `String()` matches. Numbers are accepted for compatibility, and the output is always a canonical string.

The schema checks the format. The currency-dependent rule runs in the resolver, because the target currency is often known only after the account is loaded. The web form calls the same helper for inline errors.
- *Alternative: the Binance list for crypto.* It is async, live, and unavailable in the shared schema. Treating "not ISO" as crypto is synchronous and conservative. Odd ISO codes such as XAU are treated as fiat, which matches today's behavior.

### D6. Serialization by key allowlist

`serialize()` converts a `Decimal` under a native key (`amount`, `accountAmount`, `destinationAmount`, `feeAmount`, `appliedRate`, `initialBalance`, `currentBalance`) to `decimal.toFixed()`, a full-precision string with no exponent. Every other `Decimal` stays a number. This is one change point covering the web API, `/v1` and MCP (`mcp/utils/toolResult.ts` already calls `serialize`).

`SettlementRequest.amount` and `ProviderImportedTransaction.amount` also become strings, because they share the key. That is consistent with the documented rule "every `amount` is a decimal string".
- *Alternative: all Decimals become strings.* This breaks every valuation consumer for no gain.
- *Alternative: per-service string mapping.* This scatters the rule across about 25 call sites.

### D7. `TransactionCorrection`

```prisma
model TransactionCorrection {
  id            String                      @id @default(cuid())
  transactionId String                      // no FK: must outlive the transaction
  userId        String                      // owner and actor
  action        TransactionCorrectionAction // update | delete
  previous      Json
  corrected     Json?                       // null on delete
  createdAt     DateTime                    @default(now())
  user          User                        @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, transactionId, createdAt])
}
```

- The snapshot holds the 11 financial fields from the spec, with decimals stored as strings.
- It is written by `updateTransaction` (only when one of those fields changed) and by `deleteTransaction`, inside their existing `prisma.$transaction`.
- Settlement approval and import create transactions. They do not correct them, so they write no row.
- The actor is the owner. Only owners can edit transactions today, and `/v1` and MCP act as the credential's user; the credential itself is already in the audit log line. `ponytail:` a single `userId` column means actor and owner are the same. Add `actorUserId` if non-owner edits (for example group admins) are introduced.

### D8. Guards

- **Account currency lock.** `accounts/services/update.service.ts` rejects a currency change when a transaction references the account.
- **Crypto sharing guard.** This is one check, `assertShareableCurrency`, added to the existing shared sharing helper (the `transaction-sharing-conversion` "one shared helper") and to the settlement request and approval services.

### D9. Web

- `amount` and the new fields become `string` in `types/transactions.types.ts`. Form drafts already hold strings, and they are sent as-is (the `Number(draft.amount)` conversions on save and prefill are removed).
- `utils/currency.ts#formatMoney` accepts `number | string`:
  - ISO codes use `Intl.NumberFormat` with `style: "currency"`.
  - Other codes use `Intl.NumberFormat` with `maximumFractionDigits: 18`, passed the string unchanged (exact with Intl.NumberFormat v3), plus the code.
- The `toFixed(2)` fallback is removed.
- The form field couplings are pure functions in `pages/Transactions/utils/` and add:
  - currencies differ → show the applied-amount field, prefilled from `GET /currencies/rate`
  - same currency → hide and clear it
- The detail view shows the record from the multi-currency spec.
- Sharing arithmetic stays numeric, because crypto sharing is rejected.

## Risks / Trade-offs

- **[Breaking contract] `/v1` and MCP clients that read `amount` as a number get a string.** → Document it as breaking in `docs/PUBLIC_API.md` and in the MCP tool descriptions. Inputs still accept numbers. The product is pre-production, with trusted users only.
- **[Suggestion at today's rate for a back-dated record]** → The suggestion is visible and editable before saving, and the response returns the persisted value. Rate history stays out of scope, per the roadmap.
- **[Rows created between `migrate deploy` and the new API starting have null applied amounts]** → The backfill statements are idempotent (`WHERE "accountAmount" IS NULL`). The deploy task confirms that the external deploy runs migrations immediately before starting the new API, or re-runs the statements after the switch. The resolver never reads null back, because it writes on every create and update.
- **[Genuine mismatched rows keep today's (wrong) balance effect after the backfill]** → They are listed by a read-only query for the owner to correct through the audited correction flow. The count is 2 locally, and production is pending approval to inspect.
- **[`Intl.supportedValuesOf` treats any ISO code as fiat]** → This matches today's 2-decimal behavior for every Frankfurter currency, and crypto codes are never ISO.
- **[Wider columns]** → `numeric(12,2)` to `numeric(30,18)` is lossless in Postgres. It rewrites the table, which takes seconds at the current size.

## Migration Plan

1. **Prisma migration, generated.**
   - Widen `Account.initialBalance` and `Transaction.amount` to `Decimal(30,18)`.
   - Add `accountAmount`, `destinationAmount`, `feeAmount`, `feeCurrency` and `appliedRate`, all nullable.
   - Add the `TransactionCorrectionAction` enum and the `TransactionCorrection` table.
2. **Backfill, appended to the same `migration.sql`** (raw SQL, **requires approval**, see decisions):
   ```sql
   UPDATE "Transaction" SET "accountAmount" = "amount"
     WHERE "accountId" IS NOT NULL AND "accountAmount" IS NULL;
   UPDATE "Transaction" SET "destinationAmount" = "amount"
     WHERE "type" = 'transfer' AND "transferToAccountId" IS NOT NULL AND "destinationAmount" IS NULL;
   ```
   This reproduces exactly what today's balance code computes, so every balance is unchanged. It writes no correction rows, because it is a structural fill, not a correction.
3. **Optional relabel** (**separate approval**): set `executionCurrency` to the account's currency for rows created before migration `20260730001648` was applied, whose `executionCurrency` differs from the account's and whose `exchangeRate = 1`. Their `amountInPreferredCurrency` snapshot is not recomputed.
4. **After deploy:** run the read-only listing of the remaining genuine mismatches (`executionCurrency <> account.currency`, after any relabel) for each owner.
5. **Rollback.** The app rollback is safe: old code ignores the new nullable columns and reads the widened numerics. A schema rollback is not planned, because narrowing to `(12,2)` would truncate crypto values. Rolling back means redeploying the previous app only.

No reset is proposed. The smallest coherent reset scope, if it were preferred, is in tasks 9.2. It needs explicit approval of the exact statements, because deleting transactions cascades to shared expenses, participants, settlement requests and relations, and nulls settlement and import links.
