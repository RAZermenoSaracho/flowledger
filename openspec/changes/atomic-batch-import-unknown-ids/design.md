## Context

Batch import already validates every row before creating anything, so the 400 path is all-or-nothing. The gap is the write loop (N independent transactions) and the resolver that drops unknown ids before validation can see them.

## Decisions

**D1. One transaction for the write phase.** Extract the body of `importProviderImportedTransaction`'s `prisma.$transaction` callback into a helper taking `tx` and pre-resolved fields (type, category, applied amounts, currency fields). The single-row function calls it inside its own transaction; the batch resolves fields per row first (no `tx`, may call the exchange-rate provider), then opens one `prisma.$transaction` and calls the helper per row. Alternative of nested `prisma.$transaction` is not possible (Prisma has no nesting); passing `tx` is the standard approach.

**D2. Concurrency guard inside the transaction.** Keep the in-transaction re-read `findFirst({ id, userId })` with a status check per row (already present), so a row imported concurrently makes the whole batch roll back with the existing 400. `clearProviderPendingNotifications(tx, userId)` runs once after the loop.

**D3. Transaction timeout.** Max batch is 50 via `/v1` and MCP; web `filtered` mode is unbounded. Rows are plain inserts with precomputed fields, so one transaction is fine for tens of rows. Set an explicit generous `timeout` on the batch transaction rather than add chunking (chunking would break atomicity). Upper bound for `filtered` mode is an owner decision.

**D4. Unknown ids fail the batch.** `resolveImportedTransactionSelectionIds` keeps its signature for `filtered`. For `ids` it compares requested (deduplicated) against found rows with ownership in the Prisma `where` and throws `HttpError(400, ..., { errors })` listing each missing id with one message. The ids are echoed from the request, so nothing about other users' data is revealed. Chosen because it is the same all-or-nothing contract the batch already uses for wrong-status rows, MCP/agent clients get a deterministic outcome, and it avoids a "partial" response type. Cost: a stale web selection (row removed) fails the batch until refreshed.

**D5. Idempotency.** Retrying a batch after success returns 400 (rows no longer pending), reported per row, with no duplicate transactions. This matches single import (`importing it again returns 400`). No idempotency-key mechanism.

**D6. Response.** Add `requestedCount`. `errors` stays `[]` on success (kept for compatibility with MCP and web).

## Risks / Trade-offs

- Longer-held transaction locks on the touched rows; mitigated by precomputation and the 50-id cap on public surfaces.
- Behavior change for `/v1` and MCP clients that relied on skipping foreign ids: spec line "Ids that are not the caller's SHALL be skipped" is replaced.
- Applying D4 to ignore/unignore widens scope slightly; it is one shared resolver, so keeping them different would need a flag.
