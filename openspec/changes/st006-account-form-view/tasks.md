# Tasks

## 1. Foundations

- [x] 1.1 Confirm ST-005 exports `useFormDraft`, `FormView` and `EditableField`; add the `/accounts/:id` entry to `constants/routes.ts`. Verify: `npm run typecheck -w apps/web` passes.
- [x] 1.2 Add `getAccountTypeLabel` (with TSDoc) to `pages/Accounts/utils/accountDisplay.ts`, `checking` labeled as checking/debit. Verify: `utils/tests/accountDisplay.test.ts` covers every `AccountType` and the `checking` label.

## 2. Hooks

- [x] 2.1 Add `pages/Accounts/hooks/useAccountForm.ts`: `useFormDraft` adapter (initial from account, shared-schema validate, save via `accountsClient.updateAccount` with `changedKeys`, blank identifier to `null`, invalidate `accounts`/`transactions`). Verify: `hooks/tests/useAccountForm.test.ts` (msw) covers load, dirty, validation block, batch save, server error keeps draft.
- [x] 2.2 Add `pages/Accounts/hooks/useAccountActions.ts` for archive, restore and delete, moved from `useAccountEditForm`. Verify: `hooks/tests/useAccountActions.test.ts` covers each mutation and query invalidation.

## 3. View

- [x] 3.1 Add `AccountTypeSections.tsx` (type-to-section map, empty today) with TSDoc. Verify: `components/tests/AccountTypeSections.test.tsx` shows a registered test section only for its type.
- [x] 3.2 Add `pages/Accounts/AccountDetailPage.tsx`: lookup by id (archived included), not-found state, `FormView` with the five directly editable fields (no Edit button; ST-005 compact header Save/Discard), `AccountSyncPanel`, archive/restore/delete (confirm, return to list). Verify: `tests/AccountDetailPage.test.tsx` covers render, direct edit and save, discard, not-found for unknown/foreign id, synced panel, archive, delete.
- [x] 3.3 Register the route in `main.tsx`. Verify: route renders under the authenticated layout (covered by 3.2 test via router).

## 4. List cleanup

- [x] 4.1 Make rows link to the view; remove inline edit form, row expansion and `useAccountEditForm`; use type labels. Verify: updated `AccountListItem.test.tsx` and `AccountsPage.test.tsx` pass; no references to `useAccountEditForm` remain (`grep`).

## 5. Verification

- [x] 5.1 `npm run typecheck`, `npm run lint`, `npm run test` pass.
- [ ] 5.2 Browser check at 375px and desktop: open, edit, save, discard, archive, delete, a foreign-id URL shows not-found; no horizontal scroll or iOS zoom.
- [ ] 5.3 Update `docs/KNOWN_ISSUES.md` only if this change surfaces or closes an item.
