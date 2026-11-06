# Tasks

Groups A, B and C below touch disjoint files and can run in parallel. Group D waits for all three.

## 1. SearchBar chip removal

- [x] 1.1 In `SearchBar.tsx`, route all chip removal through one `removeChip`, add the empty-input Backspace handler (ignoring repeat, modifiers and composition), Backspace and Delete on a focused chip button, focus handoff, and the polite live region. Add cases to `tests/SearchBar.test.tsx` for: last-chip removal, group-by chip first, text editing preserved, Delete in input is a no-op, held key removes one, focused chip Delete, focus placement, live region text. Verify `npm run test -w apps/web -- SearchBar` passes.

## 2. Dropdown clipping

- [x] 2.1 In `layout/AppLayout.tsx`, replace `overflow-x-hidden overflow-y-visible` on `<main>` with `overflow-x-clip` and replace the incorrect comment with the actual reason. Assert in `layout/tests/AppLayout.test.tsx` that `<main>` has `overflow-x-clip` and not `overflow-x-hidden`. Verify the test passes.
- [x] 2.2 Audit: confirm by grep that no other ancestor of a `SearchBar` or dropdown panel sets overflow other than `visible`, listing Accounts, Transactions and Imported, Categories, Groups, Shared Expenses and Debts. Record the result in the PR description. Verify no page needed a change.

## 3. Auto-sync flag

- [x] 3.1 In `apps/api/src/config/env.ts`, add the private boolean-flag parser and use it for `SYNCFY_AUTO_SYNC_ENABLED`. Extend `config/tests/env.test.ts` for `true`, `TRUE`, `1`, `false`, `0`, empty, unset, whitespace, and `yes` (startup error naming the variable). Verify `npm run test -w apps/api -- env` passes.
- [x] 3.2 Confirm by grep that nothing else reads the flag and that `resyncSyncfyConnection` and the webhook path do not depend on it. Verify the existing `syncfyAutoSyncScheduler.test.ts` passes unchanged.
- [x] 3.3 Document accepted values and the invalid-value failure in `.env.example` (comment only), `README.md` and `docs/PROVIDER_SYNC.md`.
- [x] 3.4 Run a throwaway API on port 4099 with `SYNCFY_AUTO_SYNC_ENABLED=false` and verify no "Scheduler started" log appears. Repeat with `true` to verify it does. Stop the instance.
- [x] 3.5 After 3.4 passes, flip `docs/KNOWN_ISSUES.md` #027 to `[RESOLVED]` with the decision.

## 4. Verification (after groups A, B, C, D and the `fix-transaction-date-display` tasks 7.x)

- [x] 4.1 Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:coverage -w apps/web`, `npm run test:coverage -w apps/api`, and `npm run build`; verify all pass.
- [x] 4.2 In a browser, verify with empty lists on Accounts and Transactions that the filter menu and Filter dialog are fully visible with no inner scrollbar at desktop and 360px widths, and verify Backspace, Delete and held-key behavior with a screen reader or the accessibility tree. Stop any browser started.
- [x] 4.3 Run `openspec validate --all --strict`; verify it passes.
