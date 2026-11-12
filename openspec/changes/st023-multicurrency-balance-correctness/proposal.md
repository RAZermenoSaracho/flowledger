# Proposal

## Why

`calculateAccountBalance` applies one raw `amount` to every account a transaction touches. It also ignores both the transaction's and the account's currency. As a result:

- A 100 USD to MXN transfer adds 100 MXN.
- A USD expense on an MXN account subtracts the USD figure as if it were MXN.

In addition, amounts are `Decimal(12,2)` and travel as JavaScript numbers, so a crypto quantity such as `1.234567890123456789 BTC` cannot be stored, summed or returned exactly. Edits overwrite financial values with no record of who changed what.

B-006 (ST-023) fixes these before B-007 and before any advanced financial feature (ST-014, ST-015) builds on balances.

## What Changes

- **Native applied amounts.** `Transaction` gains `accountAmount`, the amount applied to `accountId` in that account's currency, and `destinationAmount`, the amount credited to `transferToAccountId` in its currency.
  - Both are persisted on every write. Balances use only these amounts and `initialBalance`, summed with `Prisma.Decimal`.
  - A later rate change never alters a native balance.
- **Cross-currency execution details.**
  - Optional `feeAmount` with `feeCurrency`, stored only when explicitly known, as audit detail. A fee is never subtracted a second time.
  - Optional `appliedRate`, the stated rate. When it is absent, the record shows an effective rate derived from the persisted amounts.
  - `Transaction.date` remains the only execution instant.
  - `exchangeRate` and `amountInPreferredCurrency` keep their meaning as preferred-currency valuation snapshots.
- **Suggestions.** When currencies differ and the client omits an applied amount, the server suggests it at the current rate and persists it. The web form shows the suggestion as an editable value. Same-currency amounts are copied exactly.
- **Exact precision.**
  - `Account.initialBalance`, `Transaction.amount` and the new amount and rate columns become `Decimal(30,18)`.
  - **BREAKING (API/MCP output):** native amount fields (`amount`, `accountAmount`, `destinationAmount`, `feeAmount`, `appliedRate`, `initialBalance`, `currentBalance`) are serialized as decimal strings. Valuations such as `amountInPreferredCurrency`, `currentBalanceInPreferredCurrency`, report totals and debts stay numbers.
  - Inputs accept decimal strings, and plain JSON numbers stay accepted for compatibility.
  - Fiat (ISO 4217) amounts keep 2-decimal rounding. Any other currency accepts up to 18 decimals, and more are rejected with a 400.
- **Correction history.** A new append-only `TransactionCorrection` table is written in the same database transaction as any financial edit, and as a final row on delete, which survives the deletion. Rows are never updated.
- **One write path.** A single applied-amount resolver is used by create, update, provider import and settlement approval. This applies to the web API, `/v1` and MCP.
- **Guards.**
  - An account's currency cannot change once transactions reference it (closes KNOWN_ISSUES #013).
  - Sharing or settling a crypto-denominated transaction is rejected with a clear message.
- **Web.**
  - The transaction form adds "Amount in account currency" and "Amount received" when currencies differ, plus optional fee and stated rate fields.
  - The detail view shows the full cross-currency record.
  - Money formatting renders decimal strings exactly.
- **ST-008 disclosure removed.** The cross-currency net-worth disclosure is removed, because the distortion it described is fixed.
- **Existing data.** No reset is proposed.
  - An approval-gated backfill sets `accountAmount = amount` and `destinationAmount = amount`. This reproduces every current balance exactly.
  - Rows that were genuinely recorded in a currency other than their account's are listed so the owner can correct them through the audited correction flow.
  - No amount or rate is guessed. Destructive or relabelling steps are listed as decisions requiring approval.

## Capabilities

### New Capabilities
- `multi-currency-balances`: native applied amounts, execution details (fee, stated or effective rate), suggestions, the single balance calculation, the account-currency lock, and the cross-currency form and detail display.
- `native-amount-precision`: the `Decimal(30,18)` path, decimal-string input and output, fiat rounding versus the 18-decimal rejection, and crypto sharing and settlement rejection.
- `transaction-corrections`: the append-only correction history for edits and deletions.

### Modified Capabilities
- `financial-overview`: the "Disclosures" requirement drops the cross-currency disclosure.

## Impact

- **Schema:** one Prisma migration. It widens columns losslessly, adds five nullable `Transaction` columns, adds the `TransactionCorrection` table, and includes the approval-gated backfill statements.
- **API:**
  - `transactions` (create, update and delete services, utils, calculations)
  - `accounts` (read and update)
  - `debts` (settlement approval)
  - the imported-transaction import path
  - `shared-expenses` (crypto guard)
  - `reports` (Decimal sums, disclosure)
  - `utils/serialize.ts`
  - `/v1` and MCP contracts, through shared schemas
- **Shared:** a decimal amount schema, a precision helper, transaction schema fields, and the report disclosure enum.
- **Web:** transaction types, Transactions form and detail, `utils/currency.ts` formatting, Accounts balances, and the Profile financial overview.
- **Docs:** `docs/PUBLIC_API.md`, `docs/DATA_MODEL.md`, `docs/DOMAIN_LOGIC.md` and `docs/KNOWN_ISSUES.md` (#013).
- **No new dependencies.** It uses `Prisma.Decimal` in the API and native `Intl` in the shared package and the web app.
- **Compatibility risk:** `/v1` and MCP clients that read `amount` as a number will now receive a string. This is documented as breaking in `PUBLIC_API.md`.
