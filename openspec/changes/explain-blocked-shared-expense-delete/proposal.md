## Why

Deleting a transaction whose shared expense has a payment or a pending/approved settlement is refused with 400 `Cannot delete the transaction: <name> has payments or settlement requests. Settle or reverse them first.` (`shareGuards.ts` `assertNoSettlementActivity`, called from `transactions/services/delete.service.ts`). The refusal is intentional financial integrity: `paidAmount`, settlement requests and the two settlement transactions would otherwise disappear or drift.

Two defects make it unactionable (Odoo #194):

1. The web gives no feedback. Both delete call sites (`TransactionsPage.tsx` `confirmDeleteTransaction`, `TransactionDetailPage.tsx` Delete menu item) run a `useMutation` with no error handling and discard the rejected promise, so the 400 is never shown. The confirmation also promises that settlements "will also be removed", which is false when the delete is refused.
2. The message advises "reverse them", but no reversal exists. Approved settlements and direct settles are final: `/settlements/:id/reject` only handles pending requests, and nothing in web, `/v1` or MCP reverses a payment. The guidance points at a path that does not exist.

## What Changes

- Web: show the server's refusal message on both delete surfaces (list and detail) and make the confirmation text accurate.
- API: reword the delete/unshare guard message by cause: recorded payments or approved settlements ("cannot be reversed"), or only a pending request ("reject it first"). Same 400 status and `fieldErrors.sharedExpense` shape.
- Web: the unshare-locked hint in the Sharing tab drops the "Settle or reverse" wording.
- MCP: `delete_transaction` description states the refusal rule (text only).
- No new reversal workflow, no schema change, no data reset. The guard itself is unchanged: paid amounts stay immutable.

## Non-goals / follow-up

A real reversal of an approved settlement (undo payment, adjust `paidAmount`, handle both settlement transactions, audit row) is a separate, larger intent needing owner design decisions: "[INTENT] Reverse an approved settlement with audit trail". Also found, out of scope: the guard protects only the shared-expense side. Deleting a settlement transaction itself (its `SettlementRequest` link is `onDelete: SetNull`) leaves `paidAmount` unchanged: "[ISSUE] Deleting a settlement transaction leaves the share marked paid".

## Capabilities

### Modified Capabilities
- `transaction-sharing-conversion`: settlement guard messages state the cause and reachable action; the web surfaces a blocked delete.

## Impact

`apps/api/src/modules/shared-expenses/utils/shareGuards.ts`, `apps/api/src/modules/mcp/controllers/tools.writes.controller.ts` (description), `apps/web/src/pages/Transactions/TransactionsPage.tsx`, `TransactionDetailPage.tsx`, `components/TransactionSharingTab.tsx`, plus tests listed in `tasks.md`. No API contract, schema or dependency change.
