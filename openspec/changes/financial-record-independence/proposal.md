## Why

Odoo #194, #197, #198 and #199 are one problem: a user-initiated delete or a group-level delete can silently change, or be blocked by, another user's financial records. This change consolidates the plan for all four. It replaces the earlier unapproved research change `preserve-other-users-records-on-delete`.

Approved product principles (owner):

- **A.** A user may delete their own transaction, including one linked to a shared expense or settlement. Only that transaction and its owner's balance change. It never deletes another user's transaction, the shared expense, the participant shares or the settlements, and never silently modifies other users' records.
- **B.** Shared-expense history stays visible to authorized participants after the original transaction is deleted (amount, currency, dates, description, shares, accepted obligations, payment history, settlements), with an "Original transaction deleted" indicator.
- **C.** Deleting a transaction linked to a paid settlement never reverses it. The settlement stays approved and the share stays paid, with a "Linked transaction deleted" indicator. No debt is recreated and the counterparty's transaction is not deleted. Reversal is a separate explicit operation (#197).
- **D.** No deletion silently modifies another user's transactions, shared expenses, shares, settlements, payments, groups, categories or references.
- **E.** Deleting the original transaction and deleting the shared expense are different operations. The direct shared-expense delete policy needs owner approval (OD2).
- No event sourcing, no global soft delete, no new ledger.

## What Changes

Everything below the principles is PROPOSED architecture unless marked otherwise.

- **#194, original transaction delete.** `DELETE /transactions/:id` (REST, `/v1`, MCP share one service) removes only the caller's transaction and the caller's own notifications. A linked shared expense is detached (`transactionId` null) with a snapshot of type, currency, date, group and category written at detach time. The `assertNoSettlementActivity` refusal is removed from this path only.
- **#198, settlement transaction delete.** Already matches principle C (`SetNull`, status and `paidAmount` unchanged). Adds a per-side `*TransactionDeletedAt` marker (a null id is ambiguous because direct-settle requests also have null ids), the "Linked transaction deleted" indicator, and the missing tests. #198's premise (re-open the debt) contradicts principle C; see OD6.
- **#199, group and category delete.** Delete group and delete group category are refused with 409 when another user's records reference them; Archive is the primary action. No migration.
- **#197, settlement reversal.** Blocked on product decisions. Only the decision list is recorded.
- Direct shared-expense delete and unshare: only when no share is accepted, no payment and no pending or approved request (OD2).
- Fix cross-user notification deletion (unscoped metadata match) and the read-then-act ownership races.

## Capabilities

### New Capabilities
- `financial-record-independence`: detach semantics, settlement-transaction markers, group and category delete guards.

### Modified Capabilities
- `transaction-sharing-conversion`: delete-transaction no longer refused by settlement guards.
- `public-rest-api`: transaction deletion semantics.
- `mcp-personal-tools`: `delete_transaction` and `delete_category` descriptions and behavior.
- `debts-views`: indicators and failed-delete messaging.

## Non-goals

- Reversal of approved settlements (#197) beyond the decision list.
- Last-admin removal guard (found in #199): out of scope; propose a separate Odoo task (not created here).
- Per-user hidden flags, global soft delete, event sourcing, a new ledger.

## Impact

`database/prisma/schema.prisma` plus one Prisma migration (no backfill; attached rows need no snapshot, so existing records stay valid), `apps/api` transactions, shared-expenses, debts, groups, categories and reports modules, notification cleanup util, web Debts, Shared Expenses, Transactions and Groups pages, `docs/DATA_MODEL.md`, `docs/DOMAIN_LOGIC.md`. No new dependency.
