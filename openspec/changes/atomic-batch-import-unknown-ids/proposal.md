## Why

Odoo task #158 (KNOWN_ISSUES #021). The batch import of pending provider-imported transactions is neither atomic nor honest about its selection. Still reproduces on `razs_ai` (3c76c91):

- `batchImportProviderImportedTransactions` (`apps/api/src/modules/transactions/services/create.service.ts`) validates rows up front, then loops `await importProviderImportedTransaction(...)`. Each call opens its own `prisma.$transaction`, so the batch is N transactions. A failure on row k (a row imported or ignored concurrently, a DB error) leaves rows 1..k-1 as real `Transaction` records and the rest pending. The MCP tool description admits this ("not wrapped in one database transaction").
- `resolveImportedTransactionSelectionIds` (`transactions/utils/importedTransactionQuery.ts`) re-queries `{ userId, id in ids }` and silently drops every id that is missing or owned by someone else. A request for 5 ids can import 3 and answer 201 with `importedCount: 3` and `errors: []`. The same helper feeds batch ignore and unignore.
- Callers: web `POST /transactions/imported/batch-import`, `/v1/imported-transactions/batch-import` (ids mode, max 50), MCP `import_imported_transactions`. All route to the same service.

## What Changes

- Batch import runs its creates inside ONE `prisma.$transaction`; any failure rolls back every row. The per-row currency and exchange-rate lookups run before the transaction opens (they are I/O), and a transaction-scoped create helper is shared with the single-row import.
- In `ids` mode, any requested id that is not an existing row owned by the caller makes the batch fail with 400 and a per-id `errors` list (`Imported transaction not found`). A missing id and another user's id produce the same message, so existence is not revealed. Nothing changes. (Chosen over "process valid ids and report": see Owner decisions.)
- A row that is not pending (already processed or ignored) keeps today's per-row 400, and nothing changes.
- The same unknown-id rule applies to batch ignore and unignore, because they share the resolver.
- `filtered` mode (web only) resolves by query; a batch import resolving to more than `MAX_TRANSACTION_PAGE_SIZE` (10,000, `transactions/utils/boundedPagination.ts`) rows fails with 400 and imports nothing.
- Remove the "not wrapped in one database transaction" sentence from the MCP tool description.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `public-rest-api`: "Imported-transaction review" now fails a batch that names unknown ids, instead of skipping them, and requires batch import to be atomic.

## Impact

- API: `transactions/services/create.service.ts`, `update.service.ts`, `utils/importedTransactionQuery.ts`, `mcp/controllers/tools.imports.controller.ts`, create controller response, `docs/PROVIDER_SYNC.md` / `docs/DOMAIN_LOGIC.md` batch notes if they describe the contract.
- Web: none required; `onSuccess` already ignores the body and the 400 `errors` path already exists. Check the error display lists the not-found rows.
- No schema or data change, no migration, no reset.
