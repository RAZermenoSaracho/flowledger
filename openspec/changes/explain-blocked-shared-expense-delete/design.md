## Context

Guard flow: `DELETE /transactions/:id` (also `/v1`, MCP `delete_transaction`) calls `deleteTransaction`, which loads the transaction scoped by `{ id, userId }` with shared expense, participants and settlement requests, and calls `assertNoSettlementActivity` inside the Prisma transaction before any write. A throw rolls back everything, including the correction row. `hasSettlementActivity` is `paidAmount > 0` or any pending/approved request; rejected requests do not block. The same helper guards `DELETE /shared-expenses/:id` and unsharing (`apply.service.ts`).

Reference case: a paid share with an approved settlement trips both conditions.

## Decisions

- **Fix the message and the web display, not the guard.** Paid amounts are financial history; deleting them would orphan the debtor's and creditor's settlement transactions (`SettlementRequest` FKs are `SetNull`). A reversal is a new financial workflow and is split out.
- **Message by cause, in the existing helper.** One edit to `assertNoSettlementActivity` fixes delete transaction, delete shared expense and unshare for web, `/v1` and MCP. Paid or approved wins over pending when both exist. No new error code or response field.
- **Web shows `mutation.error.message` inline.** No toast system exists and no `ApiError` import is needed (`apps/web/CLAUDE.md` forbids it in pages; `Error.message` suffices). Rejected: a preflight "can delete" flag on the transaction response, which adds API surface for a state the server already enforces.
- **Rejected: expose a settlement reversal now.** It needs design for `paidAmount`/status, both settlement transactions, account balances, notifications, the other user's consent and an audit row.

## Risks

- Existing tests assert the old message and are updated in the same change; no in-repo client matches the string.
- Rejected requests still do not block; unchanged.
