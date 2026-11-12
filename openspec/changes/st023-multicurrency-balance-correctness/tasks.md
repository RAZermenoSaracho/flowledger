# Tasks

Implementation starts only after `/opsx:apply` is authorized. The steps marked **APPROVAL** must not run until the product owner approves the exact statement. Run `npm run typecheck`, `npm run lint` and `npm run test` before considering any group done. Route, integration and e2e suites need the Docker VM (`CLAUDE.local.md`).

## 1. Shared precision contract

- [ ] 1.1 Add `isFiatCurrency`, `normalizeNativeAmount` and `decimalAmountSchema` to `packages/shared` (D5). Verify: shared schema/util tests cover:
  - a string round trip of `1.234567890123456789`
  - number input `4.5` → `"4.5"`
  - exponent and garbage rejected
  - 19 decimals rejected
  - fiat `10.005` → `"10.01"`
  - 13 integer digits rejected
- [ ] 1.2 Switch the native amount fields of the transaction, account and imported-transaction update schemas to `decimalAmountSchema`. Add optional `accountAmount`, `destinationAmount`, `feeAmount`, `feeCurrency` and `appliedRate` (fee pair together; `appliedRate` > 0). Remove `cross_currency_effects` from the financial-overview disclosure enum. Verify: `schemas/tests/{transactions,accounts,reports}.test.ts` pass with the new cases.

## 2. Schema and migration

- [ ] 2.1 Update `schema.prisma` per D1, D2 and D7 (widened columns, five nullable columns, the `TransactionCorrection` model and enum, the `User` relation). Run `npm run prisma:generate`. Verify: `npm run typecheck` compiles against the new client.
- [ ] 2.2 Generate the migration with `prisma migrate dev --create-only` against local staging only. **APPROVAL (decision 1):** only after approval, append the two idempotent backfill `UPDATE`s from design "Migration Plan" step 2. Verify on local staging:
  - before and after `GET /accounts`, every `currentBalance` is identical
  - `select count(*) from "Transaction" where "accountId" is not null and "accountAmount" is null` returns 0

## 3. Serialization and balance

- [ ] 3.1 Implement the D6 key allowlist in `utils/serialize.ts`. Verify: a new `utils/tests/serialize.test.ts` covers native keys → exact strings with no exponent (`1e-18` case), other Decimals → numbers, and Date passthrough.
- [ ] 3.2 Rewrite `calculateAccountBalance` and `withAccountBalances` on `Prisma.Decimal` (D4). Select the new columns in `accounts/services/read.service.ts`, and convert to number only for the preferred-currency valuation. Verify: `transactionCalculations.test.ts` covers:
  - same-currency regression (the existing cases unchanged)
  - a USD→MXN transfer applying 100 and 1712.50
  - a USD expense on an MXN account
  - an 18-decimal BTC sum
  - fees not subtracted

## 4. Single write path

- [ ] 4.1 Add `transactions/utils/appliedAmounts.ts` (D3), including suggestion, precision normalization, the fee/rate validation, and a 400 when no rate is available. Verify: `utils/tests/appliedAmounts.test.ts` with a mocked `getExchangeRate` covers equal currencies (exact copy), a stated value winning, a suggestion rounded per target currency, a missing rate, and the fee pair.
- [ ] 4.2 Use it in `createTransaction` and `updateTransaction`. Recompute on update when amount, currency, type, an account, or a stated applied amount changes. Replace the `Math.round(body.amount * 100)` share-floor check with `Decimal` comparison. Verify: `create.service.test.ts` and `update.service.test.ts` cover cross-currency create and update, a same-currency regression, and ownership in every `where`.
- [ ] 4.3 Use it in `importProviderImportedTransaction`, with the provider currency against the account currency, and in `approveSettlement`, where both sides are same-currency. Verify: the import and `debts/services/tests/update.service.test.ts` tests assert the persisted `accountAmount`.

## 5. Correction history

- [ ] 5.1 Write a `TransactionCorrection` row in `updateTransaction`, only when one of the 11 financial fields changed, and a deletion row in `deleteTransaction`, both inside the existing `$transaction` (D7). Verify:
  - service tests assert the previous and corrected snapshots (decimals as strings)
  - no row for a description-only edit
  - a rollback when the insert fails
  - the deletion row written with `corrected = null`
- [ ] 5.2 Integration test (`src/tests/integration/transactionCorrections.integration.test.ts`, real Postgres) covering:
  - the edit through `/v1` and MCP writes one row each
  - the delete leaves its row behind after the transaction is gone
  - another user sees nothing

## 6. Guards

- [ ] 6.1 Add the account currency lock in `accounts/services/update.service.ts` (400 naming `currency` when referenced). Verify with a service test, and mark KNOWN_ISSUES #013 resolved.
- [ ] 6.2 Add `assertShareableCurrency` to the shared sharing helper and to the settlement request and approval services (D8). Verify: shared-expense and debts service tests reject BTC and accept MXN, on create, convert and update.

## 7. Consumers

- [ ] 7.1 Make `financialOverview.service.ts` use the Decimal balance, and remove the cross-currency disclosure from the service and from `pages/Profile/components/FinancialOverviewSection.tsx`. Verify: `financialOverview.service.test.ts` asserts a cross-currency transfer leaves native balances correct and produces no disclosure. The Profile component test passes.
- [ ] 7.2 Make the reports `read.service.ts` and `calculateMonthlyCashflow` sum through `Decimal` and output numbers, with the semantics unchanged. Verify: the existing reports tests pass unchanged, plus one 18-decimal crypto sum case.

## 8. Web

- [ ] 8.1 Make `formatMoney` and `formatCompactMoney` accept decimal strings exactly (D9), and change the transaction types to string amounts. Verify: `utils/tests/currency.test.ts` renders `1.234567890123456789 BTC` exactly and keeps the USD and MXN outputs unchanged.
- [ ] 8.2 Add the applied-amount, received-amount, fee and stated-rate fields with their couplings and suggestion prefill. Send strings without `Number()`. Add inline precision errors through `normalizeNativeAmount`. Verify: the `pages/Transactions/utils/tests/*` coupling and save tests, plus a msw-backed component test that overrides the suggestion.
- [ ] 8.3 Add the cross-currency record display on the transaction detail view (source, destination, time, stated or "effective" rate, fee). Verify with a component test for net-only (effective) and explicit-fee cases.

## 9. Data, docs and release

- [ ] 9.1 Update `docs/PUBLIC_API.md` (decimal-string contract, marked breaking), the MCP tool descriptions, `docs/DATA_MODEL.md`, `docs/DOMAIN_LOGIC.md` (balance invariants, fee rule), and `SHORT_TERM_ROADMAP.md` (the ST-023 status only when it ships). Verify: docs review in the PR.
- [ ] 9.2 **APPROVAL (decisions 2-4), no execution without it:**
  - Run the read-only production counts. These are the local staging queries from design "Context": mismatched rows, cross-currency transfers, crypto accounts, and dependent shared expenses, relations and settlements.
  - Optionally relabel the pre-`20260730001648` mislabeled rows.
  - Only if a reset is chosen instead of owner correction, use the smallest coherent scope: delete the genuinely mismatched transactions after first deleting or reverting their settlement requests (`SettlementRequest.*TransactionId` is `SetNull`, which would leave approved settlements with no transaction) and resetting linked `ProviderImportedTransaction` rows to `pending`; `SharedExpense`, participants and `TransactionRelation` cascade.
  - Users, auth, credentials, settings, categories, groups and accounts are never touched.
  - Verify: the approved statements are recorded in the PR, along with the before and after counts.
- [ ] 9.3 Confirm the external deploy runs `prisma migrate deploy` immediately before starting the new API, or else re-run the idempotent backfill after the switch. Then do the full-suite run (`npm run test` with the Docker VM). Verify: the deploy checklist is in the PR description and the full suite is green.
