## Why

Odoo #194. Deleting a transaction that has a shared expense with payments or a pending/approved settlement is refused (400 "Settle or reverse them first"). The web shows nothing, and no reversal exists. The owner rejected a message-only fix: the root problem is that deletion today is not user-owned.

Product requirement (owner): deleting your own financial record removes only your record. If A and B share an expense and a settlement and A deletes their transaction or settlement, B's transactions, settlement history and balances stay unchanged. B removing theirs is a separate action B starts.

Central invariant: **no user-initiated deletion may silently modify another user's financial records, balances or history.**

Current code violates it, and the refusal is the symptom of a guard patching a cascade:

- `DELETE /transactions/:id` deletes the owner's `Transaction`; `SharedExpense.transaction` is `onDelete: Cascade` (`schema.prisma:465`), participants cascade (`:485`) and settlement requests cascade (`:512`). With no payment or pending/approved request, a participant's accepted share and rejected requests vanish, and their debt disappears from their balance.
- The delete also removes other users' notifications: `delete.service.ts:36-60` and `sharedTransactionCleanup.ts:20-40` match by metadata with no `userId` filter.
- `DELETE /shared-expenses/:id` runs the same cleanup with no notice to participants (`shared-expenses/services/delete.service.ts:14-15`).
- The guard (`shareGuards.ts:27-35`) blocks only the cases where the cascade would destroy paid history, which leaves the owner unable to remove their own transaction at all.

## What Changes

- Deleting a transaction removes only that user's `Transaction`, own notifications and own correction history. A shared expense that other users have a financial stake in survives, detached from the deleted transaction (`transactionId` null, origin fields kept).
- A shared expense nobody else has a stake in (manual participants, or only proposed/rejected unpaid shares) is removed as today, and proposed/rejected users are notified.
- The "has payments or settlement requests" refusal is removed from `DELETE /transactions/:id`. It stays on explicit structural actions (unshare, delete shared expense, remove participant), which are owner actions on the obligation itself, are notified, and keep their payment guards. Their message is made accurate.
- Deleting a settlement transaction removes only that user's transaction (already so, via `SetNull`); web, docs and specs state that the obligation and the other user's records are unchanged, and the settlement row shows a "your transaction was removed" marker.
- Web: delete errors are shown (no more discarded rejections) and confirmations state the true consequences.
- Data model: `SharedExpense.transactionId` becomes nullable with `onDelete: SetNull`, plus nullable origin columns written at detach time. Existing rows are untouched, so no backfill or reset.

## Non-goals and related tasks

- Reversing an approved settlement (#197) stays separate: it changes both users' balances, so it must be a mutual-consent workflow, not a deletion. This change removes its coupling to #194.
- #198 (deleting a settlement transaction leaves the share paid) is not a bug under the invariant: the payment obligation is mutual history and one side's cash record does not undo it. It is subsumed here as confirmed intended behavior plus the marker and copy; close or merge it.
- Existing cross-user cascades outside this flow (group delete sets members' `Transaction.groupId` null; group-category delete sets `categoryId` null; user deletion cascades) are not user-reachable deletes of a transaction or settlement and are listed as a follow-up decision, not changed here.

## Capabilities

### Modified Capabilities
- `transaction-sharing-conversion`: guard requirement narrowed to structural actions; delete-transaction independence added.
- `public-rest-api`: transaction deletion semantics.
- `mcp-personal-tools`: `delete_transaction` behavior and description.
- `debts-views`: detached shared expense and removed-settlement markers.

## Impact

`database/prisma/schema.prisma` and one Prisma migration, `apps/api` transactions delete service and shared-expense/debt origin reads, notification cleanup util, web Transactions and Debts pages, docs (`DATA_MODEL.md`, `DOMAIN_LOGIC.md`), and tests listed in `tasks.md`. No new endpoint, no new dependency, no data reset.
