## 1. API

- [x] 1.1 Extract a `tx`-scoped create helper (guarded `updateMany` pending claim with a count check, `createMany`, per-row link update) from `importProviderImportedTransaction`; single import uses it. Verify single-import cases in `create.service.test.ts` are unchanged.
- [x] 1.2 Rewrite the write loop of `batchImportProviderImportedTransactions`: precompute per-row fields, one `prisma.$transaction` (30 s timeout), one notification clear; reject selections above `MAX_BATCH_IMPORT_ROWS` (500) with 400. Verify unit tests: a link update rejecting on row 2 of 3 rejects the batch with a single `$transaction` call and no commit; over-cap selection returns 400.
- [x] 1.3 In `resolveImportedTransactionSelectionIds` (ids mode) throw 400 with per-id `errors` for ids not found; one message for missing and foreign. Verify resolver unit tests and the ignore/unignore batch tests.
- [x] 1.4 Remove the "not wrapped in one database transaction" sentence from the MCP `import_imported_transactions` description.

## 2. Tests

- [x] 2.1 One integration test (`src/tests/integration/`, Postgres): a batch with one nonexistent id and one other user's id returns the identical 400 `errors` message for both, and no row is imported.
- [x] 2.2 Integration test with a realistic large batch: 500 pending rows (the cap) import atomically within the transaction timeout, and 501 rows in `filtered` mode return 400 with nothing changed.

## 3. Docs and verification

- [x] 3.1 Update batch notes in `docs/` if they describe the contract.
- [x] 3.2 `npm run typecheck`, `npm run lint`, `npm run test` (integration needs the Docker VM per CLAUDE.local.md).
- [x] 3.3 Staging acceptance:
  - a batch where one row was ignored concurrently (ignore it in a second session after selecting) fails with 400 and every other row is still pending with no new transactions;
  - a batch with a random UUID and another user's id returns the identical 400 and imports nothing;
  - a valid batch imports every row.

## Owner decision

Decided: the `filtered`-mode cap is 500 rows (`MAX_BATCH_IMPORT_ROWS`), with a 30 s transaction timeout.

## Outcome (owner accepted 2026-11-25)

- Staging (8fbf72c): the owner checked navigation and the imports review page, saw Unignore offered for an ignored row, and imported a row successfully. No regressions.
- Automated, isolated testcontainers, asserting HTTP and DB state:
  - batches of 1, 25, 100, 250 and 500 import exactly; 501 rows return 400 with no change; re-import returns 400; duplicate ids are deduped;
  - mixed batches with valid, unknown, foreign and ignored ids return 400 with per-id errors and no change, for import, ignore and unignore;
  - a forced failure after the claim rolls back fully;
  - two concurrent imports of the same ids give exactly one success and no double transactions.
- Performance at 500 rows, Docker VM at ~34 ms RTT: 4.1–4.4 s and 1017 statements in one transaction, versus 20.8–21.1 s and ~7008 statements in 501 transactions before. Local Postgres: 3.6 s.
- Full suites on 8fbf72c: API 2707/2707, shared 448/448, web 1865/1866 (one load timeout in untouched notification-model code, which passes alone).
- Not tested, owner-accepted: real batch imports on staging (only Syncfy sync creates pending rows), the Syncfy webhook path, and non-USD rows. Batch ignore/unignore are uncapped by design.
- UX follow-ups (pre-submit cap warning, progress state, descriptive failure rows) are tracked in Odoo #191.
