Groups 1 and 2 share one migration file if implemented together. Group 3 is independent. Group 4 is blocked. Nothing here is implemented until the owner approves the plan and the OD items they affect.

## Group 1. #194 Original transaction delete

Scope: principles A, B, D. Depends on: nothing.

- [ ] 1.1 Prisma: `SharedExpense.transactionId String? @unique`, `onDelete: SetNull`; add `originType`, `originCurrency`, `originDate`, `originGroupId`, `originCategoryId`, `originExpenseOffsetCategoryId`, `transactionDeletedAt`. One migration, no raw SQL, no backfill. Update `docs/DATA_MODEL.md`.
- [ ] 1.2 `shared-expenses/utils/sharedExpenseOrigin.ts` helper and tests; replace every reader listed in design.md R2 (API and web); remove the `?? "USD"` fallback; fix compile errors from the nullable relation.
- [ ] 1.3 `transactions/services/delete.service.ts` per design D4; drop `assertNoSettlementActivity` from this path; scope notification deletion by `userId` there and in `transactions/utils/sharedTransactionCleanup.ts`.
- [ ] 1.4 API fields `originTransactionDeleted`; web indicator, no dead transaction link, notification targets resolve to the debt view; confirmation copy; show server errors on delete; update `delete_transaction` MCP description.
- [ ] 1.5 Rename the guard message in `shareGuards.ts`.

Acceptance (staging): with disposable users A and B, deleting A's original transaction in each matrix row returns 204; B's debt, share, paid amount, settlements, transactions and notifications are unchanged; both see "Original transaction deleted"; a pending request can still be approved; B deleting A's id returns 404; a repeat returns 404.

Tests: unit (`mockDeep<PrismaClient>`) for delete service rows (no shares, proposed, rejected, accepted, pending, partial, settled), helper, debts readers, notification scoping, rollback on failure. Two-user integration on REST, `/v1` and MCP, including concurrent delete and approve; update the tests listed in design.md.

Staging verification: disposable users only, no production data. Rollback: code revert is safe; reverting the migration requires that no detached rows exist (owner-approved test-data reset under the pre-production policy).

## Group 2. #198 Settlement transaction markers

Scope: principle C. Depends on: the Group 1 migration.

- [ ] 2.1 Add `debtorTransactionDeletedAt` and `creditorTransactionDeletedAt` (same migration if bundled); set the matching side in the delete service.
- [ ] 2.2 Expose `debtorTransactionDeleted` and `creditorTransactionDeleted`; "Linked transaction deleted" in settlement and debt views and the Related tab; direct-settle requests never show it.
- [ ] 2.3 Tests for the previously untested path.

Acceptance (staging): deleting either settlement transaction, in either order, leaves status approved and share paid with the matching indicator and the other side untouched; a direct-settle request shows no indicator.

Tests: unit for markers; two-user integration on REST, `/v1`, MCP for debtor-first, creditor-first, both, and unrelated user (404). Rollback: as Group 1.

## Group 3. #199 Group and category delete guards

Scope: principle D. Depends on: nothing; no migration. Decision: OD4.

- [ ] 3.1 `groups/services/delete.service.ts` and `categories/services/delete.service.ts`: in one `$transaction`, check ownership and admin, then count other users' references (Transaction, ProviderImportedTransaction, SharedExpense origin ids, SettlementRequest category ids); throw 409 with the Archive message; otherwise delete.
- [ ] 3.2 Web: Archive primary; Delete shows the reason when blocked. MCP keeps no group delete; `delete_category` description updated.

Acceptance (staging): with a second member holding a transaction in the group, delete group and delete group category return 409 and nothing changes; archive works; own-only group deletes as before; personal category delete unchanged.

Tests: unit for the guard with each reference type; two-user integration on REST, `/v1`, MCP. Rollback: code revert only.

## Group 4. #197 Settlement reversal (blocked)

Blocked on OD5. No implementation tasks until the owner decides who initiates, the consent model and how transactions are offset. Depends on the Group 2 markers.

## Group 5. Direct shared-expense delete (OD2, pending)

- [ ] 5.1 After approval: refuse delete and unshare with 409 unless only proposed or rejected shares exist; notify participants; same on REST and `/v1`. Update `shareGuards` and its tests.

## Verification

- [ ] `npm run typecheck`, `npm run lint`, `npm run test`; integration tests with the Docker VM; `npx openspec validate financial-record-independence --strict`.
