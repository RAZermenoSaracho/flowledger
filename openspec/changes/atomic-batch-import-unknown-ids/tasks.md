## 1. API

- [ ] 1.1 Extract a `tx`-scoped create helper from `importProviderImportedTransaction`; single import uses it. Verify `create.service.test.ts` single-import cases unchanged.
- [ ] 1.2 Rewrite the write loop of `batchImportProviderImportedTransactions`: precompute per-row fields, one `prisma.$transaction` with explicit timeout, one notification clear, return `requestedCount`. Verify unit tests: a mocked failure on row 2 of 3 rejects the whole batch (single `$transaction` call).
- [ ] 1.3 In `resolveImportedTransactionSelectionIds` (ids mode) throw 400 with per-id `errors` for ids not found under `{ userId, id in ids }`; message identical for missing and foreign. Verify `importedTransactionQuery` tests, plus ignore/unignore batch tests.
- [ ] 1.4 Update the create controller response and the MCP `import_imported_transactions` description and result.

## 2. Tests

- [ ] 2.1 Integration test (`src/tests/integration/`, Postgres): fault injected on row k leaves all rows pending and zero new transactions; unknown and foreign ids return identical 400 and change nothing; replay returns 400 with no duplicates; ownership of user B untouched. Cover REST, `/v1` and MCP.
- [ ] 2.2 Web: check the batch import error display shows per-row `errors` (msw test if missing).

## 3. Docs and verification

- [ ] 3.1 Update batch notes in `docs/` and the `public-rest-api` spec text via archive sync.
- [ ] 3.2 `npm run typecheck`, `npm run lint`, `npm run test` (integration needs Docker VM per CLAUDE.local.md).
- [ ] 3.3 Staging acceptance:
  - batch of N pending rows with a deliberately failing row (e.g. fault flag or concurrently ignored row) leaves all N pending and no new transactions;
  - batch with one random UUID and one other user's id returns 400, identical messages, nothing imported;
  - valid batch imports all and response shows `requestedCount == importedCount`;
  - replaying it returns 400 and creates no duplicates;
  - same checks through `/v1` and MCP.

## Owner decisions

- Fail the batch on unknown ids (recommended) vs import valid ids and report not-found ids.
- Apply the unknown-id rule to batch ignore/unignore too (recommended) or import only.
- Already-processed rows: keep 400 (recommended) vs treat as idempotent no-op success.
- Cap or timeout for web `filtered` mode batches (unbounded today).
