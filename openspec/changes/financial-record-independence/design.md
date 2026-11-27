## Context and verified root causes

Line references verified against `origin/razs_ai` (head at planning time).

- **R1.** `SharedExpense.transactionId` is required and `onDelete: Cascade` (`schema.prisma:459` field, `:466` relation). Deleting the original transaction cascades to `SharedExpense`, then `SharedExpenseParticipant` (`:485`), then `SettlementRequest` (relation to participant, `:512`).
- **R2.** `SharedExpense` stores only `title`, `totalAmount`, `status`. Type, currency, date, category and group exist only on the `Transaction`. Readers of `sharedExpense.transaction.*`: `debts/utils/debtDirection.ts:7,14`; `debts/services/create.service.ts:71`; `debts/services/update.service.ts:50-53` (type filter in `settleDebtDirectly`), `:99-114`, `:243`, `:332`, `:349`, `:416-420`, `:510`; `shared-expenses/utils/groupVisibility.ts:25-41`; `shared-expenses/utils/transactionVisibility.ts:10` (already null-tolerant); `reports/services/financialOverview.service.ts:144`; `transactions/services/read.service.ts:346,371` (Related tabs). Web: `SharedExpenseDetailPage.tsx:47` (`?? "USD"` fallback) and `:48`, `pages/Debts/utils/debtDisplay.ts:63`, `pages/Debts/hooks/useDebtSettlementWorkflow.ts:145-232`, `layout/utils/notificationTarget.ts:95-99`.
- **R3.** The only protection is `assertNoSettlementActivity` (`shared-expenses/utils/shareGuards.ts:26-36`; `hasSettlementActivity` `:20-24`). It blocks on `paidAmount > 0` or a pending or approved request and ignores acceptance, so an accepted unpaid share is destroyed silently, while a paid share leaves the owner stuck with "Settle or reverse them first", and no reversal exists.
- **R4.** Notification cleanup in `transactions/services/delete.service.ts:34-59` and `transactions/utils/sharedTransactionCleanup.ts:18-35` matches on metadata with no `userId` filter and deletes counterparties' notifications.
- **R5 (#198).** `SettlementRequest.debtorTransactionId` and `creditorTransactionId` are nullable, unique, `SetNull` (`:515-516`). Deleting a settlement transaction nulls the link; `paidAmount` and `status` are unchanged and both `TransactionRelation` rows cascade (`:450`). This already matches principle C. Missing: a marker (`settleDebtDirectly`, `debts/services/update.service.ts:45-126`, creates approved requests with null ids), the UI, and tests.
- **R6 (#199).** Group delete (`groups/services/delete.service.ts:21-24`, admin only, REST only) cascades Group to Category (`:327`); `Transaction.groupId`, `categoryId`, `expenseOffsetCategoryId` are `SetNull` (`:373-375`), so every member's transactions silently lose group and category. Group-category delete (`categories/services/delete.service.ts:5-8`; REST, `/v1`, MCP `delete_category` at `mcp/controllers/tools.writes.controller.ts:165-175`) silently uncategorizes other members' transactions. `SettlementRequest.*CategoryId` are plain strings and dangle. Personal categories are single-user and safe. Archive exists on all surfaces and is non-destructive; Delete sits next to Archive behind only `window.confirm`.
- **R7.** Ownership checks in the account, category and group deletes read and then act outside one transaction.

## Decisions

### D1. Referential strategy (proposed)

`SetNull` plus an explicit detach marker, with snapshot columns written at detach time only. Rejected: `Restrict` plus app-level detach (needs the same columns and more code); per-user hidden flags (leak deleted amounts into every balance and report query).

### D2. Migration (one Prisma migration, no backfill)

Attached rows need no snapshot, so existing records remain valid. On `SharedExpense`: `transactionId` nullable, `onDelete: SetNull`, still `@unique`; add `originType TransactionType?`, `originCurrency String?`, `originDate DateTime?`, `originGroupId String?` (no FK), `originCategoryId String?` (no FK), `originExpenseOffsetCategoryId String?` (no FK), `transactionDeletedAt DateTime?`. On `SettlementRequest`: `debtorTransactionDeletedAt`, `creditorTransactionDeletedAt` (`DateTime?`).

### D3. Read helper

One `sharedExpenseOrigin(sharedExpense)` util returns `{type, currency, date, groupId, categoryId, expenseOffsetCategoryId, name, deleted}`, from the transaction when attached, else from the snapshot. Every reader in R2, including `debtDirection`, uses it. The API exposes `originTransactionDeleted` and a nullable `transaction`; the web removes the `?? "USD"` fallback, shows the indicator and drops the dead link. The type filter in `settleDebtDirectly` becomes load by id and ownership, then `getDebtDirection`.

### D4. deleteTransaction (one service for REST, /v1, MCP), one `$transaction`

1. Load the transaction scoped by `userId` (404 otherwise).
2. If it is the original of a shared expense, write the snapshot and `transactionDeletedAt`.
3. If it is a settlement side, set that side's `*TransactionDeletedAt`.
4. Write the `TransactionCorrection` row (existing).
5. Delete notifications only where `userId` is the deleter (R4).
6. Delete the transaction; the database `SetNull` detaches it.

`assertNoSettlementActivity` is removed from this path only. Shares, requests, `paidAmount`, statuses and the counterparty's transactions are never touched. A repeat delete returns 404. A concurrent approve still works because it reads the snapshot; delete versus snapshot is covered by the single transaction.

### D5. Detached shared expense keeps working

Accepted shares stay owed. Pending requests can still be approved, creating the debtor and creditor transactions from the snapshot. Proposed shares stay visible and actionable (OD1). Re-sharing is impossible without a transaction; the owner creates a new one.

### D6. Notifications

No new notification types; existing counterparty notifications are kept. Links to a deleted transaction resolve to the shared-expense or debt view with the indicator (`notificationTarget.ts`). OD3 asks whether to notify.

### D7. #198

Markers from D2, the "Linked transaction deleted" indicator on settlement and debt views, the Related tab and the API (`debtorTransactionDeleted`, `creditorTransactionDeleted`). Rename the guard message that promises a reversal that does not exist.

### D8. #199 (no migration)

Delete group and delete group category become guarded inside one `$transaction`. If any `Transaction`, `ProviderImportedTransaction`, `SharedExpense` (`originGroupId`, `originCategoryId`) or `SettlementRequest` (`*CategoryId`) owned by another user references the group or its categories, refuse with 409 "Other members have records in this group. Archive it instead." The caller's own references keep today's behavior. Personal categories unchanged. UI: Archive primary; Delete shown with the reason when blocked. MCP keeps no group delete. The ownership check moves into the same transaction (R7).

### D9. Direct shared-expense delete and unshare (policy E, proposed, OD2)

Allowed only when no share is accepted, no `paidAmount > 0`, and no pending or approved request (only proposed or rejected shares). Otherwise 409 with an actionable message. Participants are notified on delete as unshare already does. Same rule on REST and `/v1`.

### D10. #197 (outline only, blocked)

An explicit mutual-consent reversal with a new `SettlementReversal` audit record; decrements `paidAmount` and recomputes status by compare-and-swap, re-opens `SharedExpense.status`; each party records their own offsetting transaction or deletes their own; REST and `/v1` first, MCP later. Depends on the #198 markers. Not detailed until OD5 is decided.

## Before/after behavior matrix

Columns per row: scenario; initiator; today; proposed (deleted / preserved / detached / balance / debt / notifications / UI). "OD" marks a dependency on an owner decision. Balance effect always applies only to the initiator's own accounts.

| Scenario | Initiator | Today | Proposed |
|---|---|---|---|
| Original deleted, no shares | Owner | Transaction and empty shared expense gone | Transaction gone; no shared expense; owner balance changes; nothing else |
| Original deleted, proposed share | Owner | Cascade deletes share silently; counterparty notifications also deleted (R4) | Transaction gone; expense detached, share kept and visible with indicator, still acceptable or rejectable (OD1); owner's notifications only |
| Original deleted, rejected share | Owner | Cascade deletes share | Detached, rejected share kept as history, indicator |
| Original deleted, accepted unpaid share | Owner | Cascade destroys the obligation silently | Detached; share stays owed; debtor and creditor figures unchanged; indicator; no new notification (OD3) |
| Original deleted, accepted share with pending request | Owner | 400 "Settle or reverse them first" | 204; detached; request stays pending and can be approved from snapshot |
| Original deleted, partially paid share | Owner | 400 | 204; detached; paid part and remainder unchanged |
| Original deleted, fully settled share | Owner | 400 | 204; detached; share paid, request approved, both settlement transactions kept; indicator |
| Debtor settlement transaction deleted | Debtor | Debtor's row deleted, link set null, status and `paidAmount` unchanged, no UI marker, no tests | Same data effect plus `debtorTransactionDeletedAt`; "Linked transaction deleted" on debtor side; creditor unchanged |
| Creditor settlement transaction deleted | Creditor | As above | Mirror: `creditorTransactionDeletedAt` and indicator; debtor unchanged |
| Both settlement transactions deleted | Either order | Both links null, request approved | Same; both markers set; share still paid; final state order-independent |
| Original and a settlement transaction deleted | Either order | Original blocked (400) so order only possible if no activity | Both succeed in any order; expense detached and side marked; no debt recreated |
| Pending request on detached expense, then approved | Debtor requests, creditor approves | Not reachable (cascade) | Approve reads snapshot; transactions created; request approved |
| Direct-settle approved request (null ids, no transactions) | Owner | Approved, null ids | Unchanged; markers null so no "deleted" indicator |
| Non-owner deletes another user's transaction | Other user | 404 | 404, nothing changes |
| Concurrent delete and approve | Owner and debtor | Possible orphan cascade | Delete snapshots in its transaction; approve uses snapshot; either order consistent |
| Group delete, other members have records | Admin | Cascades; members' transactions silently lose group and category | 409 "Archive it instead"; nothing changes (OD4) |
| Group delete, only own records | Admin | Cascade, own references cleared | Same as today |
| Group category delete, others' records | Admin | Others' transactions silently uncategorized (REST, `/v1`, MCP) | 409; nothing changes (OD4) |
| Personal category delete | Owner | Own transactions uncategorized | Unchanged |
| Group archive | Admin | Non-destructive | Unchanged; promoted to primary action |
| Member removal | Admin or self | Removes `GroupMember` and the leaver's `CategoryUser` only | Unchanged (last-admin guard out of scope) |
| Direct shared-expense delete, proposed or rejected shares only | Owner | Allowed; silent cascade, notifications swept | Allowed; participants notified (OD2) |
| Direct shared-expense delete, accepted share | Owner | Allowed if no payment or request (silent) | 409 actionable message (OD2) |

## Test impact

Update `apps/api/src/tests/integration/sharedExpenseDebtNotification.test.ts:98` (asserts the cascade); the `delete.service`, `sharedTransactionCleanup`, `shareGuards` and shared-expense delete unit tests; `apps/api/src/tests/integration/v1.crud.integration.test.ts:245-252` (asserts personal-category delete; stays valid for #199, extend with the group-category 409 case); and tests of every reader in R2.

## Open decisions

**Approved:** principles A to E above.

**Engineering decisions made here:** SetNull plus a detach-time snapshot; the `*DeletedAt` markers; notification scoping by `userId`; no MCP group delete; ownership checks inside the transaction; one consolidated change.

**Owner decisions:**
- OD1: proposed (unaccepted) shares on a detached expense stay actionable (recommended) or are withdrawn automatically.
- OD2: the direct shared-expense delete and unshare policy in D9.
- OD3: notify the counterparty when a linked transaction is deleted? Recommended: no new notification; the indicator is enough.
- OD4: #199 rule: block when others' records exist (recommended) or block when any records exist.
- OD5: #197 reversal details: who initiates, consent model, how transactions are offset.
- OD6: re-scope #198 from "bug" to "indicator and tests" (title stays, description gets an addendum).
- Last-admin removal guard (found in #199): out of scope; propose a separate Odoo task, not created here.

## Risks

Origin snapshot is read in several debt paths (tests cover direction, group and category defaults, settlement creation on detached expenses). `transaction` becoming nullable makes the compiler list every read site. Reverting the migration needs no detached rows (an owner-approved test-data reset under the pre-production policy).
