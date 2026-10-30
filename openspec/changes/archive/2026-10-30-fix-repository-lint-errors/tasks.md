## 1. Config

- [x] 1.1 `eslint.config.js`: add `.claude/worktrees/**`, `.agents/skills/**`, `.claude/skills/**` to `ignores` (no `.cjs` override). Verify: `npx eslint .` reports no errors from those paths.
- [x] 1.2 `package.json`: `"lint": "eslint . --max-warnings 0"`.

## 2. apps/api (rule: `no-unused-vars`, `no-explicit-any`)

- [x] 2.1 Remove unused: `afterEach`, `beforeEach` in `accounts/providers/syncfy/tests/syncfyAutoSyncScheduler.test.ts`; `listAvailableConnectors`, `listAvailableInstitutions` in `accounts/services/tests/providerConnections.create.service.test.ts`; `Prisma` import in `reports/types/reports.types.ts`. Manual edits (no autofix for this rule). Verify: eslint on those files, `npm run test -w @flowledger/api`.
- [x] 2.2 Replace `body: any` with the shared Zod-inferred type in `accounts/services/{create,update}.service.ts` and `transactions/services/{create,update}.service.ts`. Verify: `npm run typecheck`, API tests; no casts to `any`/`unknown`.

## 3. apps/web

- [x] 3.1 Remove unused `user` (`components/tests/SearchComponent.test.tsx:155`) and `waitFor` (`pages/Reports/components/tests/ReportFiltersCard.test.tsx`, `pages/Transactions/components/tests/TransactionCoreFields.test.tsx`).
- [x] 3.2 Delete the `eslint-disable-next-line testing-library/no-node-access` comment in `components/tests/FilterBuilder.test.tsx:73`.
- [x] 3.3 Stabilise `?? []` dependencies (11 warnings): `AccountsPage`, `CategoriesPage`, `DebtsPage`, `GroupCategoriesSection`, `SharedExpensesPage`, `TransactionsPage`. Fix with `useMemo` or a module-level empty constant. Verify: eslint clean, `npm run test -w @flowledger/web`.

## 4. Close out

- [x] 4.1 Mark `docs/KNOWN_ISSUES.md` #008 resolved.
- [x] 4.2 Acceptance: `npm run lint` exits 0 (0 errors, 0 warnings), `npm run typecheck`, `npm run test` pass; `git diff` contains no `eslint-disable`, `@ts-ignore`, new `any`, or runtime behaviour change; no unrelated files.
- [x] 4.3 Unblocks task 6.2 in `add-personal-api-keys` and `add-mcp-oauth` (tick there when archiving; Docker integration suite is separate).
