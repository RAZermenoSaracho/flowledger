## Context

Batch import already validates every row before creating anything, so the 400 path is all-or-nothing. The gap is the write loop (N independent transactions) and the resolver that drops unknown ids before validation can see them.

## Decisions

**D1. One transaction for the write phase.** Extract the body of `importProviderImportedTransaction`'s `prisma.$transaction` callback into a helper taking `tx` and pre-resolved fields (type, category, applied amounts, currency fields). The single-row function calls it inside its own transaction; the batch resolves fields per row first (no `tx`, may call the exchange-rate provider), then opens one `prisma.$transaction` and calls the helper per row. The helper keeps the in-transaction re-read `findFirst({ id, userId })` and pending check, so a row imported or ignored concurrently rolls the whole batch back with the existing 400. `clearProviderPendingNotifications(tx, userId)` runs once after the loop.

**D2. Cap on `filtered` mode.** `/v1` and MCP already cap at 50 ids. A `filtered` batch import that resolves to more than `MAX_BATCH_IMPORT_ROWS` (500, a new constant in `transactions/utils/`; `MAX_TRANSACTION_PAGE_SIZE` is unchanged) rows returns 400 and changes nothing; chunking is rejected because it would break atomicity. The transaction uses an explicit 15 s timeout (the default 5 s is too tight for 500 rows, since each row is a create plus an update, about 1,000 statements plus the per-row re-read). The cap is the owner's decision (500).

**D3. Unknown ids fail the batch.** `resolveImportedTransactionSelectionIds` keeps its signature. In ids mode it compares the deduplicated request against rows found under `{ userId, id in ids }` and throws `HttpError(400, ..., { errors })` with one entry per missing id and a single message, identical for a missing id and another user's id. Ids are echoed from the request, so nothing about other users' data is revealed. This applies to batch import, ignore and unignore, which share the resolver.

**D4. Already-processed rows keep 400.** Rows not pending are reported per row as today, and a replay of a successful batch is rejected without creating duplicates, matching single import. No idempotency key.

## Risks / Trade-offs

- Row locks are held for the duration of one transaction; bounded by the 50-id and 500-row caps.
- `/v1` and MCP clients that relied on foreign ids being skipped now get a 400, and a stale web selection fails until refreshed.
