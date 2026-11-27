## Context: who owns what today

| Row | Owner column | Feeds whose balances |
|---|---|---|
| `Transaction` (`schema.prisma:349`) | `userId` | Only that user's account balances and reports. A settlement is two separate transactions, one per user (`debts/services/update.service.ts:327-361`). |
| `SharedExpense` (`:457`) | `ownerUserId` (creator) | Creator's receivable (or payable for an income). Created from the creator's `Transaction`. |
| `SharedExpenseParticipant` (`:473`) | Row created and structured by the owner; `userId` is the debtor | The participant's `iOwe` and the owner's `owedToMe` (`financialOverview.service.ts:70, 131-149`). A participant has no `Transaction` for the share. |
| `SettlementRequest` (`:493`) | Shared by `debtorUserId` and `creditorUserId`; one nullable transaction link per side (`debtorTransactionId`, `creditorTransactionId`, both `SetNull`) | Both users' history; `paidAmount` on the participant. |
| `TransactionRelation` (`:444`) | Derived link (type `settlement_payment`); both FKs `Cascade` | Nobody; no read depends on it (`settlementTransactionWhere` also matches the request FKs, `transactions/services/read.service.ts:42-47`). |
| `Notification` (`:528`) | `userId` | Nobody's balance. |
| `Group` / `GroupMember` | `ownerUserId`; membership per user | Context only; `Transaction.groupId` is `SetNull`. |

There is no debt table: a "debt" is a participant row.

## What each delete path does to the other user today

| Path | Effect on another user | Violates invariant |
|---|---|---|
| `DELETE /transactions/:id` with no stake | Cascade deletes participants, rejected/other requests (`:465, :485, :512`) and the other users' notifications (`delete.service.ts:36-60`); no notice. | Yes |
| same, with payment/pending/approved | Refused 400 (`delete.service.ts:24`). Protects history but blocks the owner's own deletion. | No, but wrong ownership model |
| `DELETE /shared-expenses/:id`, unshare | Same cascade, same notification sweep (`sharedTransactionCleanup.ts:20-40`); unshare notifies (`apply.service.ts:354-364`), delete does not. Both refused while payment/pending/approved. | Unshare: no (explicit, notified). Delete: silent |
| delete own settlement transaction | Own row deleted, own request link set null, both `TransactionRelation` rows cascade. The share stays paid; other user's rows unchanged. | No (this is #198; correct) |
| group member removal (`groups/services/delete.service.ts:32-46`) | Removes `GroupMember` and the leaver's `CategoryUser` only. | No |
| group delete / group category delete | Sets `groupId`/`categoryId` null on every member's transactions. | Yes, outside this change |
| user deletion | FK cascades exist, but no route deletes a user. | n/a |

The REST route, `/v1` (`v1.routes.ts`) and MCP `delete_transaction` (`tools.writes.controller.ts:180-194`) all call the same service, so they behave identically; the web adds no check of its own. Ownership is already enforced in the `where` (`delete.service.ts:11-13`, `shared-expenses/services/delete.service.ts:10`), so another user's id yields 404.

## Financial invariants

1. No user-initiated deletion modifies or deletes another user's transaction, share, paid amount, settlement request or status, balance, debt figure or report row.
2. A delete removes only rows the deleting user owns: their `Transaction`, their notifications (their own correction row is appended, never removed). A `SharedExpense` is removed only when no other user has a financial stake in it.
3. A financial stake is a participant row with `userId` set to another user and any of: `acceptance = accepted`, `paidAmount > 0`, or any settlement request in any status. Stake rows are never deleted by a transaction or settlement-transaction delete.
4. Cash records and obligations are independent. A user's account balance derives only from that user's transactions. Deleting a transaction never changes `paidAmount`, share, status or requests, and deleting an obligation never deletes a transaction.
5. Changing an obligation (add or remove a share, settle, reverse) is an explicit owner or mutual action, notified to affected users, and never a side effect of deleting a record. Paid or approved amounts change only through a mutual workflow (settlement request/approve; reversal is #197).
6. A delete either completes entirely or changes nothing, including the deleter's correction row.
7. Outcomes for each user are independent of the order in which the two users delete; repeating a delete returns 404 for the deleter and changes nothing.
8. Cross-user access is indistinguishable from not found, and a detached shared expense never exposes the owner's account, notes or exchange details to participants.
9. A user's own figures that become partial because their source record was removed say so (for example "original transaction removed" next to a receivable).
10. A delete removes only the deleting user's notifications; other users receive a notification only when what they see changes.

## Decision: detach, do not cascade

When the owner deletes `T` that has shared expense `S`:

1. Load `T` and `S` with participants and requests, scoped by `{ id, userId }` (404 otherwise).
2. If no participant has a stake: delete `S` as today, notify the proposed/rejected users once, delete `T`.
3. Otherwise, in the same database transaction: write the origin columns on `S` from `T` (`originType`, `originDate`, `originGroupId`, `originCategoryId`; name, amount and currency already live in `title`, `totalAmount` and participant `currency`), delete the participants without a stake (proposed/rejected, no requests) and notify them, notify stake holders once ("{owner} removed their transaction; your share and history are unchanged"), then delete `T`. The FK `SetNull` clears `S.transactionId`.
4. Delete only the deleter's notifications (add `userId` to the filter) and append the deleter's correction row as today.

Reading: one helper `sharedExpenseOrigin(sharedExpense)` returns the live transaction fields while attached and the origin columns after detach. Debt direction, group and category defaults, and the Shared Expense page use it. The where-clause filter on transaction type at `debts/services/update.service.ts:50-53` is replaced by loading by id and ownership and applying `getDebtDirection`. API responses keep `sharedExpense.transaction` for participants (public subset, `id` null when detached) and add `originRemoved: true`; the web hides the transaction link and shows the marker.

What each user sees afterwards (owner A, participant B, share MXN 1,000 paid, approved settlement):

- A: transaction gone, account and category reports change by exactly that transaction; the receivable (`owedToMe`), settlement history and A's income settlement transaction are unchanged, and the shared expense row shows "original transaction removed". A can still unshare or delete the expense only while the existing payment guards allow it.
- B: share, paid amount, approved settlement, B's own settlement transaction, balances and `iOwe` are unchanged; one notification.
- B later deletes their settlement transaction: only B's transaction goes; the request keeps `approved` with B's link null, A sees nothing change. Order does not matter.

## Alternatives rejected

| Alternative | Why rejected |
|---|---|
| Keep the guard, only improve message (previous plan) | Leaves the owner unable to delete their own record and leaves the silent cascade for stake-less-looking cases. Fails the owner's requirement. |
| Soft-delete or hide `Transaction` per user (`deletedAt`) | Every query that reads transactions (account balances, reports, sieve, MCP, `/v1`, imports, credit-card billing) must filter it or the deleted amount leaks back into balances; the data also stays on the server after "delete". Large blast radius and a standing leak risk for a small gain. |
| Copy a snapshot of the other user's view into a new table | Duplicates participant, request and paid state; two sources of truth to reconcile. |
| Physical cascade with a warning dialog | Still silently erases the other user's history; violates invariant 1. |
| Per-user hide of a debt or share | New visibility feature; not required to satisfy the invariant. Left as an owner decision. |
| Transfer the `Transaction` to the participant | Moves the owner's account and notes to another user. |
| Always-populated origin columns synced on every transaction edit | Needs a backfill (against the pre-production policy) and sync on every edit path; snapshot at detach is enough. |
| Settlement reversal now (#197) | Changes both users' balances; needs mutual consent and design. Independent of this change. |

## Edge cases

| Case | Behavior |
|---|---|
| Owner deletes T, only manual participants | `S` deleted with `T` (owner-only data). |
| Only proposed or rejected user shares | `S` deleted with `T`; those users notified; no balance changed (not counted before acceptance). |
| Accepted unpaid share | `S` detached; share still owed; B notified. |
| Partially paid (approved settlement for part) | Detached; remaining outstanding stays; B can still request, A approve; categories default from origin. |
| Pending request | Detached; request stays pending and can still be approved or rejected. |
| Approved settlement | Detached; both settlement transactions stay. |
| Rejected request only | Counts as history stake; detached; request kept. |
| Mixed: one accepted, one proposed | Detached; the proposed share deleted and notified. |
| Participant is the deleter (settlement transaction) | Only their transaction goes; request keeps status; marker shown; other user unchanged. |
| A deletes, then B deletes settlement transaction, or reverse order | Same final state for each user (invariant 7). |
| Both delete everything they own | `S`, shares and requests remain as shared history; the owner can still unshare or delete `S` only where the payment guards allow. |
| Owner then calls `DELETE /shared-expenses/:id` | Existing rules: 400 with activity, else removed with notice to participants. |
| Participant calls delete for owner's transaction or shared expense | 404. |
| Cross-user id on any delete | 404, nothing changes. |
| Failure mid-delete | Whole database transaction rolls back, including the correction row and notifications. |
| Group transaction | `groupId` kept in origin; group views for B unchanged; owner's group totals drop `T`. Member removal does nothing to shares. |
| Income-type shared transaction | Direction (owner owes participant) comes from `originType`. |
| Notifications | Deleter's own removed; stake holders get one notice; others untouched. |
| Repeat delete | 404 for the deleter. |

## Migration and data

One Prisma migration generated by `prisma migrate`, no raw SQL: `SharedExpense.transactionId` nullable with `onDelete: SetNull` (still unique), four nullable origin columns. Existing rows stay attached and need no backfill; no reset of test data is required, consistent with the pre-production policy. `docs/DATA_MODEL.md` and `docs/DOMAIN_LOGIC.md` updated. TypeScript types of `sharedExpense.transaction` become nullable, so the compiler lists every read site to update.

## Risks

- Origin snapshot is read in a few debt paths; tests cover direction, group/category defaults and settlement creation for detached expenses.
- Owner books can look inconsistent (receivable kept after deleting the expense); mitigated by the marker and by the unshare path when nothing is paid.
- Existing specs and integration tests that assert cascading delete are updated in this change.
