# Design

## Context

See proposal.md for the motivation. These facts were verified against `razs_ai` at `7fd97a6` and by read-only database inspection on 2026-11-12.

- **Transfer shape.** A transfer is one `Transaction` row: `accountId` is the source and `transferToAccountId` the destination, with one `amount` in `executionCurrency`. `TransactionRelation` is a generic link, not the transfer mechanism.
- **One balance function.** `transactions/utils/transactionCalculations.ts#calculateAccountBalance` is the only balance function. Its callers are `accounts/services/read.service.ts` and `reports/services/financialOverview.service.ts`. It applies `amount.toNumber()` to both sides and ignores currencies.
- **Write paths.**
  - `createTransaction`, `updateTransaction` and `deleteTransaction` are shared by the web API, `/v1` and MCP.
  - `importProviderImportedTransaction` and `approveSettlement` create rows directly.
  - `approveSettlement` converts the debt currency into each account's currency at the live rate (`convertSettlementAmount`). That breaks the rule that current rates are suggestions only.
- **Number handling.** `serialize()` turns every `Decimal` into a number. `moneySchema` is `z.coerce.number()`, and native columns are `Decimal(12,2)`.
- **Production data** (read-only):
  - Volume: 6 users, 6 accounts (5 MXN, 1 USD) and 24 transactions from 2 users. All 24 are MXN, scale 2, and created on or after 2026-08-14; 18 have no account.
  - Currency and transfers: 0 transactions in a currency other than their account's, 0 transfers.
  - Sharing and settlements: 1 shared expense with 1 participant, and 1 approved settlement request linked to a creditor transaction. There are 0 relations.
  - Imports and notifications: 169 imported rows, all `ignored` and unlinked; 13 notifications, 5 of them financial.
  - **No production financial record is incorrect under the new model.**
- **Local staging data:**
  - It has 13 transactions whose currency differs from their account's. 11 were mislabeled `USD` by the backfill in migration `20260730001648`, and 2 are genuinely in a different currency.
  - Those 13 touch 5 shared expenses, 12 relations and 6 settlement requests.
  - Staging is development data.
- **Cascades.** Deleting a `Transaction` cascades to `SharedExpense`, then `SharedExpenseParticipant`, then `SettlementRequest`, and to `TransactionRelation` on both sides. `ProviderImportedTransaction.transactionId` is set to null. `Notification` references transactions only inside its JSON `metadata`. There is no `Debt` table: debts derive from participants.
- **Deploy order.** `~/scripts/deploy-flowledger-prod.sh` runs `prisma migrate deploy` and then restarts the pm2 API.

## Goals / Non-Goals

**Goals:**
- One resolver for applied amounts and one balance function, used by every write path and every consumer.
- An exact path from request decimal string to Postgres `numeric(30,18)` and back to the response, with no float in between.
- No legacy compatibility code for the previous model.

**Non-Goals:**
- No historical rate store, and no server-side rate-derived executed amounts.
- No change to report semantics.
- No recomputation of the `amountInPreferredCurrency` snapshot.
- No generic audit or event system, and no corrections read UI or endpoint until a screen needs one.
- No decimal library on the web.

## Decisions

### D1. Two applied-amount columns on the existing row

`accountAmount` and `destinationAmount` are added as `Decimal(30,18)`, nullable at the database level, because transactions without an account and non-transfers legitimately have none. The resolver guarantees the invariant on every write.

- *Rejected: two rows per transfer.* It duplicates the one-row assumption made by sharing, relations, notifications and the UI.
- *Rejected: redefining `amount` as the account-native value.* It changes a field that reports, the snapshot and every client read.

### D2. No stored rate; fees only when known

`appliedRate` is dropped. The rate is always derivable:
- Effective rate: `destinationAmount / amount` for transfers, `accountAmount / amount` otherwise.
- Rate before fee, when a fee is recorded in the source currency: `destinationAmount / (amount − fee)`.
- Rate before fee, when the fee is in the destination currency: `(destinationAmount + fee) / amount`.

Restricting `feeCurrency` to those two currencies is what makes this exact. "Correcting the rate" means correcting the received amount or the fee, both of which are persisted and audited.

A fee is detail only. Reports keep excluding transfers, so a transfer fee is not an expense, which answers the roadmap's open question. A user who wants the fee reported records it as its own expense.

- *Rejected: an `appliedRate` column.* With both amounts and the fee persisted it is redundant, and it adds a consistency check (rate × amount ≈ received) that can only drift.

### D3. One resolver; executed amounts always stated

`transactions/utils/appliedAmounts.ts#resolveAppliedAmounts` is a pure function with no rate lookup. Given the type, amount, execution currency, account currencies and the stated values, it returns `{ accountAmount, destinationAmount }` as `Prisma.Decimal`:
- Equal currencies: copy `amount`. A different stated value is rejected with 400.
- Different currencies: the stated value is required, otherwise 400 naming the field.
- It also enforces precision through D5 and the fee rules from D2.

Callers:
- `createTransaction`.
- `updateTransaction`: it re-resolves on any change to the amount, currency, type, an account or a stated value, so a cross-currency edit must restate the applied amounts.
- `importProviderImportedTransaction`: the provider currency against the account currency. Its request takes an optional `accountAmount`.
- `requestSettlement` (debtor side) and `approveSettlement` (creditor side): `settlementRequestSchema` and `settlementApprovalSchema` gain an optional `accountAmount`, required when the account currency differs from the debt currency. `convertSettlementAmount` is deleted from the write path, and the web form uses the rate endpoint for its suggestion.

Suggestions use only the existing rate lookup (`GET /currencies/rate`, `/v1/currencies/rate`, MCP `get_exchange_rate`).

- *Rejected: server-side suggestion when an applied amount is omitted.* It would persist a current rate as an executed value, which breaks the product rule. It also adds a rate-unavailable failure path to every write.

### D4. Balance in `Prisma.Decimal`

`calculateAccountBalance` returns a `Prisma.Decimal`:

`initialBalance + Σ income.accountAmount − Σ (expense|transfer-out).accountAmount + Σ transfer-in.destinationAmount`

`listAccounts` selects the two columns. Valuations call `.toNumber()` only after the native sum. `calculateMonthlyCashflow` sums through `Decimal` and returns numbers.

### D5. Precision rule from `Intl`

`packages/shared/src/schemas/common.ts` gains a format schema and a currency helper.

`decimalAmountSchema`:
- Accepts only a string matching `^-?\d{1,12}(\.\d{1,18})?$`.
- Numbers are rejected. Under the product rule, unsafe numeric contracts are not kept for compatibility.

`currencyFractionDigits(code)`:
- An ISO code returns its minor units: `new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits` (USD and MXN 2, JPY 0, KWD 3).
- Any non-ISO code (crypto) returns 18.
- ISO membership is `Intl.supportedValuesOf("currency")`.

Both apps validate with the same helper, the API in the resolver and the web app inline in the form. The rule rejects and never rounds.

`isShareableCurrency(code)` is `ISO && minor units ≤ 2`, because shared-expense and settlement columns stay `Decimal(12,2)`.

- *Rejected: Binance as the crypto list.* It is async and live, and cannot be called from a schema.

### D6. Serialization by key allowlist

`serialize()` renders a `Decimal` under a native key with `decimal.toFixed()`, which gives full precision and no exponent. The native keys are `amount`, `accountAmount`, `destinationAmount`, `feeAmount`, `initialBalance` and `currentBalance`. Every other `Decimal` stays a number.

This is one change point covering the web API, `/v1` and MCP. `SettlementRequest.amount` and `ProviderImportedTransaction.amount` become strings too, which matches the documented rule "every `amount` is a decimal string". Their input schemas move to `decimalAmountSchema` for symmetry.

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

- **Contents.** It snapshots the 10 financial fields from the spec, with decimals as strings.
- **Who writes it.** `updateTransaction` writes a row only when one of those fields changed, and `deleteTransaction` always writes one. Both write inside their existing `prisma.$transaction`.
- **What is not recorded.** Creation by import or settlement is not a correction, so it writes no row. The table is forward-only and nothing is backfilled.
- **Actor.** It is the owner, because only owners can edit transactions. `/v1` and MCP act as the credential's user, and the credential is already in the audit log line.
- `ponytail:` a single `userId` stands for both actor and owner. Add `actorUserId` if non-owner edits arrive.

### D8. Guards

- `accounts/services/update.service.ts` rejects a currency change while transactions reference the account.
- `isShareableCurrency` runs in the shared sharing helper (`transaction-sharing-conversion`'s "one shared helper") and in settlement request and approval.

### D9. Web

- `amount` and the new fields become `string` in `types/transactions.types.ts`. Drafts already hold strings, and the `Number(draft.amount)` conversions in save and prefill are removed.
- `utils/currency.ts#formatMoney(amount: number | string, currency)` formats ISO codes with `Intl.NumberFormat` currency style at the currency's minor units. Other codes use `maximumFractionDigits: 18`, passed the string unchanged, which is exact with Intl.NumberFormat v3, followed by the code. The `toFixed(2)` fallback is removed.
- Couplings stay pure functions in `pages/Transactions/utils/`:
  - Currencies differ → show the required applied-amount field, prefilled from `GET /currencies/rate`.
  - Currencies equal → hide it and leave it unset.
- The Debts settlement forms get the same field.
- The detail view shows the record defined in the spec.

### D10. Existing data: correct-or-reset, never compatibility code

The new code reads no legacy shape. There is no `accountAmount ?? amount` fallback and no "needs review" state. Before the new API serves traffic, every existing row must satisfy the new invariant. There are two ways to get there, and both are complete.

- **F, fill (recommended for production).** In the migration, set `accountAmount = amount` and `destinationAmount = amount`. This is exact for production: every row is single-currency, and the fill's values are what was actually executed. It keeps 24 correct transactions and the one settlement, and it is two statements.
- **R, financial-domain reset (recommended for local staging, and the alternative for production).** Delete the financial records, defined in the Migration Plan. It is equally small, and it is the only correct option where incorrect rows exist (local staging's 13).

Both need explicit approval of the exact SQL. F is a raw `UPDATE` inside a migration and R is a destructive script. A reset materially simplifies nothing in production, because the schema, code and tests are identical under F and R. Choosing F avoids deleting data that is correct.

## Risks / Trade-offs

- **[Breaking contract] `/v1` and MCP clients must send and read decimal strings.** → Documented as breaking in `docs/PUBLIC_API.md` and the MCP tool descriptions. First-party consumers (web, MCP schemas) change in the same PR. The audience is trusted pre-production users.
- **[API/MCP clients must state cross-currency amounts]** → The error names the field, the rate lookup is one call away, and the tool descriptions say so.
- **[Writes by the old API between `migrate deploy` and the pm2 restart lack applied amounts]** → F's statements are idempotent (`… IS NULL`), so step 6 of the Migration Plan re-runs them after the restart. Under R the window is covered by running the reset after the restart.
- **[Any ISO code counts as fiat with its minor units]** → This is correct by definition. Crypto codes are never ISO 4217.
- **[Rejecting excess fiat precision may surprise a client that used to send `10.005`]** → That client previously got silent rounding by Postgres. A rejection is the stated product rule.
- **[Column widening rewrites the tables]** → It is lossless and takes milliseconds at the current size.

## Migration Plan

All steps are approval-gated where marked. Nothing runs during planning.

1. **Backup (production).** Run `pg_dump --format=custom` of the production database and store it outside the deploy directory. This is the recovery point for both F and R.
2. **Before-snapshot (read-only).** Record per-account `currentBalance` from `GET /accounts` and row counts for `Transaction`, `SharedExpense`, `SharedExpenseParticipant`, `SettlementRequest`, `TransactionRelation` and `Notification`.
3. **Migration, created with `prisma migrate dev --create-only`.**
   - Widen `Account.initialBalance` and `Transaction.amount` to `Decimal(30,18)`.
   - Add `accountAmount`, `destinationAmount`, `feeAmount` and `feeCurrency`.
   - Add the `TransactionCorrectionAction` enum and the `TransactionCorrection` table.
   - Under F only, append the fill **(APPROVAL F)**:
     ```sql
     UPDATE "Transaction" SET "accountAmount" = "amount"
       WHERE "accountId" IS NOT NULL AND "accountAmount" IS NULL;
     UPDATE "Transaction" SET "destinationAmount" = "amount"
       WHERE "type" = 'transfer' AND "transferToAccountId" IS NOT NULL AND "destinationAmount" IS NULL;
     ```
4. **Release (`main` push, separate approval).** The deploy script runs `prisma migrate deploy`, then restarts pm2.
5. **R only (APPROVAL R).** Run this in one transaction right after the restart. The order matters: notification metadata has no foreign key, and settlement requests must go before transactions. This order was verified on local staging on 2026-11-12:
   ```sql
   BEGIN;
   DELETE FROM "Notification" WHERE "type" IN (
     'shared_expense_added','shared_expense_invited','shared_expense_updated',
     'shared_expense_accepted','shared_expense_rejected','debt_owes_money','debt_owed_money',
     'settlement_requested','settlement_approved','settlement_rejected',
     'settlement_payment_registration_needed');
   DELETE FROM "SettlementRequest";  -- first: deleting it via the Transaction cascade collides with its SetNull transaction FKs
   DELETE FROM "SharedExpense";      -- cascades SharedExpenseParticipant
   DELETE FROM "Transaction";        -- cascades TransactionRelation
   UPDATE "ProviderImportedTransaction" SET "status" = 'pending', "transactionId" = NULL
     WHERE "status" = 'imported';
   COMMIT;
   ```
   For local staging, the same script runs against `flowledger_staging` only, also with approval.
6. **Verify (read-only).**
   - `select count(*) from "Transaction" where ("accountId" is not null and "accountAmount" is null) or ("type"='transfer' and "destinationAmount" is null)` returns 0. Under F, re-run step 3's statements first, because they are idempotent.
   - Under F, every account's `currentBalance` equals the before-snapshot.
   - Under R, `SharedExpense`, `SettlementRequest` and `TransactionRelation` counts are 0, and no financial notification remains.
   - Under both, the preserved-table counts are unchanged.
7. **Recovery.**
   - Application problem: redeploy the previous commit. Old code ignores the new nullable columns and reads the widened numerics.
   - Data problem: `pg_restore` the step-1 dump into a fresh database and repoint `DATABASE_URL`.
   - No down-migration is written. Narrowing to `(12,2)` would truncate crypto values.

**Preserved under both F and R:**
- Identity and access: `User`, `UserAuthAccount`, `RefreshToken`, `ApiKey`, `OAuthGrant`, `UserBlock`.
- Organisation: `Group`, `GroupMember`, `Category`, `CategoryUser`.
- `Account`, including `initialBalance`, which widens losslessly.
- Provider data: `ProviderConnection`, `ProviderAccount`, `ProviderImportedTransaction` (only its status and link reset under R), `ProviderWebhookEvent`.
- Non-financial notifications: `group_member_added` and `provider_transactions_pending`.
- `_prisma_migrations`.
- User settings: preferred currency, theme, sidebar.

Accounts are kept under R as well. Their balances derive from transactions, so after a reset each account's balance equals its `initialBalance`, which is a consistent state.
