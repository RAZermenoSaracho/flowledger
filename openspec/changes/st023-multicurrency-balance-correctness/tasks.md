# Tasks

Start implementation only after `/opsx:apply` is authorized. Do not run any step marked **APPROVAL** until the product owner approves its exact statement. Before marking a group done, run `npm run typecheck`, `npm run lint` and the affected tests. Route, integration and e2e suites need the Docker VM (`CLAUDE.local.md`).

## 1. Shared precision contract

- [x] 1.1 Add `decimalAmountSchema`, `currencyFractionDigits` and `isShareableCurrency` to `packages/shared/src/schemas/common.ts` (D5). Verify in `schemas/tests/common.test.ts`:
  - string `"1.234567890123456789"` passes unchanged
  - number `4.5`, exponent `"1e-7"`, garbage and 13 integer digits are rejected
  - minor units: USD 2, JPY 0, KWD 3, BTC 18
  - shareable: MXN yes, JPY yes, KWD no, BTC no
- [x] 1.2 Move native amount fields to `decimalAmountSchema`. This covers the transaction, account and imported-transaction schemas and the settlement `amount`, plus a new optional settlement `accountAmount`. Add optional `accountAmount`, `destinationAmount`, `feeAmount` and `feeCurrency` to the transaction schemas, with the fee fields required together. Remove `cross_currency_effects` from the disclosure enum. Verify: `schemas/tests/{transactions,accounts,debts,reports}.test.ts` pass with the new cases.

## 2. Schema and migration

- [x] 2.1 Update `schema.prisma` per D1 and D7: widen the columns, add the four nullable columns, the `TransactionCorrection` model and enum, and the `User` relation. Then `npm run prisma:generate`. Verify: `npm run typecheck` compiles against the new client.
- [x] 2.2 Generate the migration with `prisma migrate dev --create-only` against a scratch database, not staging or production. **APPROVAL F:** append the two fill statements from the design's Migration Plan step 3 only if F is chosen. Verify: the migration SQL holds only the expected `ALTER`, `CREATE` and approved `UPDATE` statements, and applies cleanly to a testcontainers database.

## 3. Serialization and balance

- [ ] 3.1 Implement the D6 key allowlist in `utils/serialize.ts`. Verify in a new `utils/tests/serialize.test.ts`:
  - native keys become exact strings with no exponent (`0.000000000000000001`)
  - other Decimals stay numbers
  - Date passthrough
- [ ] 3.2 Rewrite `calculateAccountBalance` and `withAccountBalances` on `Prisma.Decimal` (D4). Select the new columns in `accounts/services/read.service.ts`, and convert to number only for valuations. Verify in `transactionCalculations.test.ts`:
  - existing same-currency cases unchanged
  - a USD to MXN transfer applies 100 / 1712.50
  - a USD expense on an MXN account
  - an 18-decimal BTC sum
  - the fee is not subtracted

## 4. Single write path

- [ ] 4.1 Add the pure `transactions/utils/appliedAmounts.ts` (D3), covering precision and the fee rules. Verify in `utils/tests/appliedAmounts.test.ts`:
  - equal currencies copy exactly, and a mismatching stated value returns 400
  - a missing stated value across currencies returns 400 naming the field
  - over-precision returns 400
  - fee pair and fee currency rules
  - effective rate and rate before fee for both fee currencies
- [ ] 4.2 Use the resolver in `createTransaction` and `updateTransaction`, re-resolving on any amount, currency, type or account change. Replace the cents-based share floor with a `Decimal` comparison. Verify: `create.service.test.ts` and `update.service.test.ts` cover cross-currency create and update, an update that changes the amount without restating it (400), a same-currency regression, and ownership in every `where`.
- [ ] 4.3 Use the resolver in `importProviderImportedTransaction` (optional `accountAmount`) and in settlement request and approval. Remove `convertSettlementAmount` from the write path. Verify: the import and `debts/services/tests/update.service.test.ts` cover the same currency (copied), a cross-currency case without `accountAmount` (400), and a cross-currency case with it (persisted).

## 5. Correction history

- [ ] 5.1 Write a `TransactionCorrection` row inside the existing `$transaction` of `updateTransaction` (financial-field change only) and `deleteTransaction` (D7). Verify with service tests:
  - snapshots hold decimal strings
  - no row for a description-only edit
  - the update rolls back when the insert fails
  - a deletion row with `corrected = null`
- [ ] 5.2 Add `src/tests/integration/transactionCorrections.integration.test.ts` against real Postgres. Verify:
  - edits through `/v1` and MCP each write one row
  - a deleted transaction's row remains
  - another user sees none

## 6. Guards

- [ ] 6.1 Add the account currency lock in `accounts/services/update.service.ts`. Verify with a service test returning 400 naming `currency`. Mark KNOWN_ISSUES #013 resolved.
- [ ] 6.2 Add `isShareableCurrency` checks to the shared sharing helper and to settlement request and approval (D8). Verify: shared-expense and debts service tests reject BTC and KWD and accept MXN on create, convert and update.

## 7. Consumers

- [ ] 7.1 Make `financialOverview.service.ts` use the Decimal balance, and remove the cross-currency disclosure there and in `pages/Profile/components/FinancialOverviewSection.tsx`. Verify: `financialOverview.service.test.ts` shows a cross-currency transfer leaves native balances correct with no disclosure, and the Profile component test passes.
- [ ] 7.2 Make the reports `read.service.ts` and `calculateMonthlyCashflow` sum through `Decimal` and return numbers. Verify: existing reports tests pass unchanged, plus one 18-decimal crypto case.

## 8. Web

- [ ] 8.1 Make `formatMoney` and `formatCompactMoney` accept decimal strings and use the currency's minor units (D9), and make transaction, account and debt amount types strings. Verify: `utils/tests/currency.test.ts` renders `1.234567890123456789 BTC` exactly, `1500 JPY` with no decimals, and USD/MXN unchanged.
- [ ] 8.2 Add the required applied-amount and received-amount fields and the optional fee to the transaction form, with couplings and a suggestion prefill from `GET /currencies/rate`. Send strings with no `Number()`, and show inline precision errors through `currencyFractionDigits`. Verify: `pages/Transactions/utils/tests/*` coupling and save tests, plus a msw component test that overrides the suggestion.
- [ ] 8.3 Add the settlement request and approval `accountAmount` field when the currencies differ, with a prefilled suggestion. Verify: a Debts workflow test sends `accountAmount` as a string.
- [ ] 8.4 Add the cross-currency record display to the transaction detail view: source, destination, time, effective rate, and fee with rate before fee. Verify with component tests for the net-only and explicit-fee cases.

## 9. Docs, data and release

- [ ] 9.1 Update the docs: `docs/PUBLIC_API.md` (decimal-string contract and required cross-currency amounts, marked breaking), the MCP tool descriptions, `docs/DATA_MODEL.md` and `docs/DOMAIN_LOGIC.md` (balance invariants, fee rule). Update `SHORT_TERM_ROADMAP.md` with the ST-023 status only when it ships. Verify by docs review in the PR.
- [ ] 9.2 Run the end-to-end check with the full suite (`npm run test`, Docker VM) and one e2e journey: create a USD to MXN transfer, edit the received amount (one correction row), delete it (deletion row remains), and check that a BTC 18-decimal round trip leaves balances exact. Verify: the suite is green.
- [ ] 9.3 **APPROVAL R (local staging):** reset `flowledger_staging` with the design's Migration Plan step 5 script. Verify: step 6 checks pass on staging.
- [ ] 9.4 **APPROVAL release, plus F or R for production:** follow Migration Plan steps 1 to 7 in order (backup, before-snapshot, migrate and restart through the deploy script, R if chosen, verify). Verify: the step 6 results and the dump location are recorded in the release notes.
