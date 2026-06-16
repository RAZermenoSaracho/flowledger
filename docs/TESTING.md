# Testing

---

## How to run

```bash
npm test                    # run all tests from repo root
npm test -w apps/api        # run API tests only
```

Tests are invoked via `tsx` (no build required). TypeScript files are executed directly.

---

## Test framework

No external test framework. Tests use Node's built-in `node:assert/strict` module. Assertions throw on failure; the process exits non-zero if any assertion throws or any import fails.

Each test file is a plain `.ts` script — no `describe`/`it` wrappers. Assertions run at module scope in sequence.

---

## Test files

All test files are in `apps/api/tests/`.

### `debtDirection.test.ts`

**Covers:** `apps/api/src/modules/debts/debtDirection.ts`

- `getDebtDirection()` — expense debt: participant is debtor, owner is creditor. Income debt: owner is debtor, participant is creditor.
- `getDebtDirection()` with manual participants (`userId = null`) — one side of the direction is `null`.
- `isDebtRelevantToUser()` — returns `true` for owner or participant, `false` for unrelated users.
- `isSettlementDirectionCurrent()` — verifies a stored settlement direction still matches the computed direction (stale direction detection).

---

### `providerArchitecture.test.ts`

**Covers:** webhook parsing, event deduplication, Syncfy adapter normalization, account sync summary

Imports (with env var stub preamble):
- `providerWebhooks.routes.ts` — `generatedSyncfyEventEid`, `recordSyncfyEventWithDependencies`, `syncfyWebhookSchema`
- `syncfy.adapter.ts` — `syncfyProvider`
- `syncfy.service.ts` — `normalizeSyncfyInstitution`
- `accounts.routes.ts` — `accountListItemWithSyncSummary`

Tests:
- `syncfyWebhookSchema.parse()` — parses a valid webhook payload with `rid` and `events` array.
- `generatedSyncfyEventEid()` — deterministic for same `(rid, event, index)`, differs for different index.
- `recordSyncfyEventWithDependencies()` — when `createProviderWebhookEvent` throws a Prisma P2002 (unique constraint), falls back to `findProviderWebhookEvent` and returns `shouldProcess: false` (deduplication).
- `syncfyProvider.normalizeAccount!()` — maps raw Syncfy account payload (`id_account`, `name`, `type`, `currency`, `balance` as string) to internal shape. Balance coerced to number. `rawData` stored.
- `syncfyProvider.normalizeTransaction!()` — maps raw Syncfy transaction (`id_transaction`, `id_account`, `amount` as signed string, `dt_transaction` as Unix timestamp). Unix timestamp → `Date`. `rawData` stored.
- `normalizeSyncfyInstitution()` — deduplicates `products` array (merging `checking` duplicates), adds institution's `type` to supported types.
- `accountListItemWithSyncSummary()` — manual account (no `providerAccounts`) returns `source: "manual"`, `sync: []`.

---

### `providerImportedTransactions.test.ts`

**Covers:** `packages/shared/src/schemas/` — imported transaction Zod schemas

Tests:
- `providerImportedTransactionFiltersSchema` — accepts `"pending"`, `"processed"`, `"ignored"` status values; rejects invalid status.
- `updateProviderImportedTransactionSchema` — accepts `{ categoryId: null }` (unassign category).
- `importProviderImportedTransactionSchema` — accepts empty object and `{ categoryId }`.
- `batchImportProviderImportedTransactionsSchema` — accepts `{ selection: { mode: "ids", ids: [...] }, categoryId }`.
- `batchIgnoreProviderImportedTransactionsSchema` — accepts `{ selection: { mode: "filtered", filters: { status, provider } } }`.

---

### `syncfyAutoSync.test.ts`

**Covers:** `syncfy.service.ts` (sync internals), `syncfyAutoSyncScheduler.ts`

Sets mock env vars before importing (SYNCFY_AUTO_SYNC_ENABLED=true, INTERVAL_MINUTES=17, JOB_TIMEOUT_MS=45678, CONCURRENCY=3).

Service function tests:
- `shouldMarkSyncfyManualReconnect()` — returns `true` for OTP/MFA/auth errors; `false` for timeout/upstream errors.
- `countNewSyncfyImportedTransactionIds()` — correctly counts transactions not in the existing ID set.
- `getSyncfyEndpointList()` — extracts account or transaction endpoint arrays from payload.
- `summarizeSyncfyEndpoints()` — counts endpoint types and returns endpoint type names.
- `buildSyncfyRefreshMetadata()` — sanitizes endpoints (strips sensitive query params) before storing.
- `buildSyncfyTransactionDataUrl()` — appends date range and pagination params to endpoint paths.
- `getSyncfyRefreshMetadata()` — reads metadata from `ProviderConnection.rawData`.
- `buildSyncfyProviderAccountMetadata()` — builds metadata shape from raw Syncfy account.
- `buildPendingSyncfyImportedTransactionCandidates()` — builds candidate records for new imported transactions.
- `nextSyncfyImportedTransactionStatus()` and `resolveSyncfyImportedTransactionStatus()` — status state machine logic.
- `summarizeSyncfyImportedTransactionWrites()` — aggregates write results to a summary object.
- `getManualSyncfyRefreshRetryDelaysMs()` — returns the retry delay array for manual credential refresh.
- `shouldStopSyncfyRefreshRetry()` — returns `true` when new transactions were found.
- `fetchSyncfyTransactions()` — pagination logic (mock HTTP responses).
- `normalizeSyncfyTransaction()` — maps raw Syncfy transaction payload.

Scheduler tests:
- `getSyncfyAutoSyncSchedulerConfig()` — reads from env vars (verifies interval=17, timeout=45678, concurrency=3).
- `SyncfyAutoSyncScheduler` instantiation — does not throw.
- `scheduler.isRunning()` — false before start.
- `scheduler.start()` / `scheduler.stop()` — starts and stops without error.
- `scheduler.runOnce()` — runs with injected `loadJobs` (returns empty array) and `processJob`. Verifies overlap prevention: second `runOnce()` while first is running resolves immediately with `{ skipped: true }`.

---

### `syncfyWebhookSecurity.test.ts`

**Covers:** `apps/api/src/modules/providers/syncfy/syncfy.webhookSecurity.ts`

Tests `verifySyncfyWebhookSignature()` and `getSyncfyWebhookSignatureDiagnostics()` with:

| Scenario | Expected |
|---|---|
| No `SYNCFY_WEBHOOK_SIGNATURE_KEY` configured | `"skipped"` |
| Valid hex signature | `"valid"` |
| Valid `sha256=<hex>` prefixed signature | `"valid"` |
| Valid base64 signature | `"valid"` |
| Valid base64url signature | `"valid"` |
| Invalid/tampered signature | `"invalid"` |
| Nested key object (`{ k: "..." }`) — raw string | `"valid"` |
| JWK-like object with `k.k` base64url key material | `"valid"` |
| Production JWK shape (nested `k.k`, base64url) with base64url sig | `"valid"` |
| Production JWK shape with hex sig | `"valid"` |
| Production JWK shape with base64 sig | `"valid"` |
| Structured timestamp format `t=<ts>;v1="<sig>"` | `"valid"` |
| Structured `keyId="...";signature="..."` format | `"valid"` |

---

### `transactionCalculations.test.ts`

**Covers:** `apps/api/src/modules/transactions/transactionCalculations.ts`

Tests `calculateAccountBalance()`:
- Income adds to balance for the matching `accountId`
- Expense subtracts from balance
- Transfer source (`accountId`) subtracts; transfer destination (`transferToAccountId`) adds
- `initialBalance` is added when provided (via `.toNumber()` duck-type)
- Unrelated `accountId` returns 0 (or initial balance if provided)

Tests `calculateMonthlyCashflow()`:
- Full cashflow: groups by month, computes `grossIncome`, `grossExpenses`, `incomeOffsets`, `expenseReimbursements`, `netIncome`, `netExpenses`, `balance`. Transfers excluded.
- Category filter: `{ categoryId }` — filters transactions by single category; `expenseOffsetCategoryId` matches still counted for `expenseReimbursements`.
- Multi-category filter: `{ categoryIds }` — filters by array of category IDs.

---

## What is not tested

- Route handler integration (no HTTP testing — no `supertest`)
- Database queries (no test database; all Prisma calls are production-only)
- Frontend components (no React testing library)
- End-to-end flows

These gaps exist intentionally; the test suite covers pure business logic and schema parsing that can run without external services.
