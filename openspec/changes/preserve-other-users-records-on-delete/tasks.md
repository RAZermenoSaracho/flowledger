## 1. Data model
- [ ] 1.1 `database/prisma/schema.prisma`: `SharedExpense.transactionId String? @unique`, `transaction Transaction? ... onDelete: SetNull`, nullable `originType`, `originDate`, `originGroupId`, `originCategoryId`. Generate one Prisma migration (no raw SQL, no backfill, no reset). Update `docs/DATA_MODEL.md`.
- [ ] 1.2 Fix every compile error from the nullable relation (`npm run typecheck`).

## 2. API
- [ ] 2.1 `shared-expenses/utils/sharedExpenseOrigin.ts`: pure `sharedExpenseOrigin(sharedExpense)` (live transaction fields while attached, origin columns when detached), `hasStake(participant, ownerUserId)` and the partition (stake holders, removable, manual). Tests in `shared-expenses/utils/tests/`: every acceptance/payment/request-status combination, manual participants, owner-as-participant.
- [ ] 2.2 `transactions/services/delete.service.ts`: remove the `assertNoSettlementActivity` call; implement the detach flow from design.md inside the existing Prisma transaction; scope the notification sweep by `userId`; notify removed and stake-holder participants once. Move cleanup into the shared util `transactions/utils/sharedTransactionCleanup.ts` (also add `userId` scoping used by `DELETE /shared-expenses/:id`, which also notifies participants now).
- [ ] 2.3 Replace reads of `sharedExpense.transaction.*` with `sharedExpenseOrigin` in `debts/utils/debtDirection.ts`, `debts/services/update.service.ts` (including the type filter at `:50-53`, groupId/category defaults, settlement creation), `debts/services/create.service.ts:71`, `reports/services/financialOverview.service.ts:144`, `shared-expenses/utils/transactionVisibility.ts`; serialize `originRemoved` and an `id`-null public transaction for detached expenses.
- [ ] 2.4 `shareGuards.ts`: message by cause (payments or approved cannot be undone by deleting; pending request, reject it first); drop "Settle or reverse".
- [ ] 2.5 `delete_transaction` MCP description (`mcp/controllers/tools.writes.controller.ts`) per spec.

## 3. Web
- [ ] 3.1 `TransactionsPage.tsx` and `TransactionDetailPage.tsx`: show `deleteTransaction.error?.message`, catch the rejected `mutateAsync`, and replace the confirmation copy (no claim that settlements are removed; state that others' shares and payments are unchanged).
- [ ] 3.2 Debts and Shared Expense pages: "original transaction removed" and "your transaction was removed" markers; hide `routes.transaction(...)` link when `originRemoved` (`SharedExpenseDetailPage.tsx:47-48`); `TransactionSharingTab.tsx` hint wording.

## 4. Tests (required, per `docs/TESTING.md`)
- [ ] 4.1 Service unit tests with `mockDeep<PrismaClient>` for `delete.service.ts`: paid, partially paid, pending, approved, rejected-only, accepted unpaid, proposed-only, manual-only, mixed participants; assert each writes exactly the expected calls (no participant, request or other-user notification delete for stake holders; origin columns written before delete); rollback when correction create, origin write or delete fails; 404 for foreign id before any write; settlement-transaction delete clears only the caller's link.
- [ ] 4.2 Same for `shared-expenses/services/delete.service.ts` (notice sent, guards unchanged, owner-scoped 404).
- [ ] 4.3 `debts/services` unit tests: detached expense still yields correct direction, outstanding, group/category defaults, settlement creation, and `financialOverview` figures; participant response excludes owner account and notes.
- [ ] 4.4 Docker integration tests (`src/tests/integration/`, run by the verifier): real users A and B, a paid-and-approved share. Assert both users' account balances, `owedToMe`/`iOwe`, debts, settlement history and notifications before and after each order: A deletes T then B deletes settlement transaction; B then A; A only; B only; both delete every record they own. Also partially paid, pending, rejected-only, proposed-only, group transaction, income-type expense. Unauthorized: B deleting A's transaction, A's shared expense or A's settlement transaction returns 404 and changes nothing; third user 404. Rollback: forced failure leaves everything unchanged. Update existing integration and MCP/`/v1` tests that assert cascade (`mcp.crud.integration.test.ts`, `sharingConsent.integration.test.ts`, `/v1` delete tests).
- [ ] 4.5 Web tests (msw): delete error shown on both pages and the record stays; new confirmation text; markers on Debts and Shared Expense pages for detached expenses and removed settlement transactions.

## 5. Docs and verification
- [ ] 5.1 `docs/DOMAIN_LOGIC.md` (ownership and delete semantics, invariants), `docs/TESTING.md` untouched.
- [ ] 5.2 `npm run typecheck`, `npm run lint`, targeted unit tests, then integration tests with the Docker VM; staging check with disposable fixtures only.
