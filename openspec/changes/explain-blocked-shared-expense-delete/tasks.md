## 1. API guard message
- [ ] 1.1 In `apps/api/src/modules/shared-expenses/utils/shareGuards.ts`, make `assertNoSettlementActivity` choose the message by cause (paid/approved vs pending only); keep status, field and `fieldErrors` shape; update TSDoc.
- [ ] 1.2 Extend `shared-expenses/utils/tests/shareGuards.test.ts`: paid, partially paid, approved, pending-only, rejected-only (passes), approved plus pending (paid wording wins), message names the participant.
- [ ] 1.3 Extend `transactions/services/tests/delete.service.test.ts` (mockDeep Prisma): blocked for paid, partially paid, approved, pending; allowed for rejected-only; a blocked delete performs no `notification.deleteMany`, correction create or `transaction.delete` (rollback); a foreign id yields 404 before any guard.
- [ ] 1.4 Update the `delete_transaction` description in `mcp/controllers/tools.writes.controller.ts` to state the refusal rule, and adjust its test if it asserts the text.
- [ ] 1.5 Extend `apps/api/src/tests/integration/sharingConsent.integration.test.ts` (Docker, run by the verifier): after a real approved settlement `DELETE /transactions/:id` returns 400 with the new message and the transaction, share, requests and both settlement transactions persist; another user gets 404. Same for `DELETE /shared-expenses/:id`.

## 2. Web
- [ ] 2.1 `TransactionsPage.tsx`: render `deleteTransaction.error?.message` in an alert region and catch the rejected `mutateAsync` in `confirmDeleteTransaction`; fix the confirmation copy.
- [ ] 2.2 `TransactionDetailPage.tsx`: same for the Delete menu item, keeping the user on the page.
- [ ] 2.3 `TransactionSharingTab.tsx`: replace "Settle or reverse the payments first." with text matching the new cause wording.
- [ ] 2.4 Tests (msw, `renderWithProviders`): in `TransactionsPage.test.tsx` and `TransactionDetailPage.test.tsx`, a 400 on delete shows the server message and the record stays; the success path is unchanged; update the Sharing tab test for the hint.

## 3. Verification
- [ ] 3.1 `npm run typecheck`, `npm run lint`, the targeted vitest files above, then the integration file with the Docker VM.
- [ ] 3.2 Staging check with a disposable fixture only: pay a share, try deleting from list and detail, read the message. Never use real records.
