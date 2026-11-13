# Proposal

## Why

`calculateAccountBalance` applies one raw `amount` to every account a transaction touches, and ignores both the transaction's and the account's currency. Two consequences:

- A 100 USD to MXN transfer adds 100 MXN.
- A USD expense on an MXN account subtracts the USD figure as if it were MXN.

Amounts are also `Decimal(12,2)` and travel as JavaScript numbers. A crypto quantity such as `1.234567890123456789 BTC` therefore cannot be stored, summed or returned exactly. Edits overwrite financial values and record neither who changed them nor what they were before.

B-006 (ST-023) fixes this before B-007 and before any feature that builds on balances (ST-014, ST-015). The product owner has set the priorities: correct invariants, native balances and exact precision come first. Breaking API changes and losing pre-production financial records are acceptable when they make the model cleaner.

## What Changes

- **Native applied amounts.** `Transaction` gains two columns, each persisted on every write:
  - `accountAmount`: what was applied to `accountId`, in that account's currency.
  - `destinationAmount`: what was credited to `transferToAccountId`, in that account's currency.

  When the currencies match, the value equals `amount` exactly. When they differ, the client must state it. The server never derives an executed amount from a current rate. The web app prefills an editable suggestion from the existing rate endpoint, and API and MCP clients can call the existing rate lookup.
- **Balances.** A balance is `initialBalance` plus the applied amounts, summed with `Prisma.Decimal`. One function serves the accounts list and the financial overview. A rate change only moves preferred-currency valuations, never a native balance.
- **Execution details.**
  - `feeAmount` and `feeCurrency` are optional and stored only when the fee is explicitly known. The fee must be in the source or destination currency, is audit detail only, and is never subtracted twice.
  - The rate is not stored. The record shows the effective rate derived from the persisted amounts and, when a fee is recorded, the rate before fee.
  - `Transaction.date` remains the only execution instant.
  - `exchangeRate` and `amountInPreferredCurrency` keep their meaning as valuation snapshots.
- **Exact precision.**
  - Every money and rate column becomes `Decimal(38,18)` (20 integer digits): `Account.initialBalance`, the `Transaction` amount, rate and valuation columns, `SharedExpense.totalAmount`, participant `shareAmount` and `paidAmount`, `SettlementRequest` amounts and `ProviderImportedTransaction.amount`. A second additive migration widens them losslessly.
  - Sharing and settlement work for every currency, crypto included, with exact deterministic splits. The group summary values each currency into the viewer's preferred currency instead of adding across currencies.
  - **BREAKING (API/MCP input and output).** Native amounts are decimal strings in both directions, and JSON numbers are rejected for them.
  - Fiat amounts must fit their ISO 4217 minor units: USD and MXN 2, JPY 0. Any other currency may have up to 18 decimals. Excess precision is rejected and never rounded.
  - Valuations, report totals and debts stay numbers.
- **Correction history.** An append-only `TransactionCorrection` table gets a row in the same database transaction as every financial edit. Deleting a transaction adds a final row that outlives it.
- **One write path.** A single applied-amount resolver serves create, update, provider import and settlement request and approval, on the web API, `/v1` and MCP. A settlement into an account whose currency differs from the debt's takes an explicit `accountAmount`, so it no longer converts automatically at the live rate.
- **Guards.**
  - An account's currency is fixed once transactions reference it (closes KNOWN_ISSUES #013).
  - Sharing and settlement require a fiat currency with at most 2 minor units. Crypto is rejected with a clear message.
- **Web.**
  - Transaction and settlement forms show "Amount in account currency" or "Amount received" when currencies differ, prefilled and editable, with an optional fee.
  - The transaction detail view shows the cross-currency record.
  - Money formatting renders decimal strings exactly.
  - The ST-008 cross-currency disclosure is removed.
- **Existing data.**
  - Read-only inspection of production found no incorrect records: 24 transactions, all MXN in MXN accounts, no transfers and no crypto.
  - The migration fills `accountAmount`/`destinationAmount = amount`, which is the actual executed value there.
  - A full financial-domain reset is specified as an approval-gated alternative.
  - Local staging, whose 13 rows are incorrect, gets the scoped reset.

## Capabilities

### New Capabilities
- `multi-currency-balances`: required native applied amounts, execution details, the single balance calculation, the account-currency lock, and the cross-currency forms and display.
- `native-amount-precision`: `Decimal(38,18)`, the decimal-string-only contract, precision limits by currency, and exact deterministic splits for every currency.
- `transaction-corrections`: append-only correction history for edits and deletions.

### Modified Capabilities
- `financial-overview`: the "Disclosures" requirement drops the cross-currency disclosure.

## Impact

- **Schema:** one Prisma migration. It widens columns losslessly, adds four nullable `Transaction` columns and the `TransactionCorrection` table, and includes the approval-gated fill.
- **API:**
  - `transactions`: create, update and delete services, utils, calculations.
  - `accounts`: read and update.
  - `debts`: settlement request and approval, and their schemas.
  - The imported-transaction import path.
  - `shared-expenses`: the currency guard.
  - `reports`: Decimal sums and disclosure.
  - `utils/serialize.ts`.
  - The `/v1` and MCP contracts.
- **Shared:** decimal and precision schema primitives, transaction, account and settlement schema fields, and the disclosure enum.
- **Web:** transaction types, Transactions form and detail, the Debts settlement forms, `utils/currency.ts`, Accounts and Profile.
- **Docs:** `PUBLIC_API.md` (breaking contract), `DATA_MODEL.md`, `DOMAIN_LOGIC.md`, `KNOWN_ISSUES.md`.
- **No new dependencies.** The API uses `Prisma.Decimal`; the shared package and the web app use native `Intl`.
