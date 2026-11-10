# Tasks

Implement after ST-005 (`st005-reusable-editable-form-view`) and ST-003 (`st003-convert-transaction-to-shared`, whose consent capability defines `accepted`/`proposed`/`rejected` shares), as the last intent of the B-004 PR.

## 1. Shared contract

- [ ] 1.1 Add `financialOverviewQuerySchema` and the response schema/types (net worth components, `excluded`, `partial`, savings-rate status, disclosure codes, `awaitingAcceptance` count) to `packages/shared/src/schemas/reports.ts`, with TSDoc. Verify: `packages/shared/src/schemas/tests/reports.test.ts` covers valid and invalid `timeZone` and the response shape; shared tests pass.

## 2. API service

- [ ] 2.1 Create `reports/services/financialOverview.service.ts` with the net worth calculation (non-archived accounts, debts, per-item `Promise.allSettled`, scoped by `userId`). Verify: `reports/services/tests/financialOverview.service.test.ts` (mocked Prisma) covers components, card debt and overpaid card, same-currency transfer neutrality, settlement neutrality, archived exclusion, missing rate (named, partial) user isolation (`where` includes `userId`), and consent: only `accepted` shares count in receivables/payables, `proposed` and `rejected` are excluded, and `awaitingAcceptance` counts the `proposed` ones.
- [ ] 2.2 Add the savings rate: previous complete month in the given time zone, `calculateMonthlyCashflow`, statuses `ok`, `no_data`, `unavailable_income`, `unavailable_rate`; metrics isolated. Verify: same test file covers month selection across a time-zone boundary, a negative rate, zero and negative income, no data, transfers excluded, a missing rate that leaves net worth intact.
- [ ] 2.3 Add disclosure codes. Verify: same test file asserts each disclosure appears only when it applies (archived balance, past-month currency, cross-currency, investment, synced, none).

## 3. API wiring

- [ ] 3.1 Add the controller handler (`asyncHandler`, `serialize()`) in `reports/controllers/` and `GET /financial-overview` in `reports.routes.ts` with `requireAuth` and `validate(financialOverviewQuerySchema, "query")`. Verify: `reports/controllers/tests/read.controller.test.ts` covers the handler, and `reports/tests/reports.routes.test.ts` (supertest, real Postgres) covers 401 without a token, 400 on a bad `timeZone`, success, and two users seeing only their own data. Needs Docker per `CLAUDE.local.md`.

## 4. Web

- [ ] 4.1 Add `getFinancialOverview` to `apps/web/src/services/reports.client.ts` (sends the device `Intl` time zone). Verify: `services/tests/reports.client.test.ts` with msw asserts the path and `timeZone` param.
- [ ] 4.2 Add `Profile/hooks/useFinancialOverview.ts`. Verify: `Profile/hooks/tests/useFinancialOverview.test.ts` with msw covers success and error.
- [ ] 4.3 Add `Profile/components/FinancialOverviewSection.tsx` (loading, error, partial, unavailable, not enough data, grouped disclosures, labels, mobile and both themes) and render it as a child of `GeneralTab`, with no `profile` prop. Verify: `Profile/components/tests/FinancialOverviewSection.test.tsx` with msw covers each state and that disclosures render only when present; `GeneralTab` test confirms the section renders.

## 5. Docs

- [ ] 5.1 Add `GET /reports/financial-overview` to the reports row in `docs/PUBLIC_API.md`, and a "Financial overview" subsection under Reports in `docs/DOMAIN_LOGIC.md` (definitions, partial and unavailable states, disclosures). Verify: the entries match the implemented response.

## 6. Verification

- [ ] 6.1 `npm run typecheck`, `npm run lint` and `npm run test` pass.
- [ ] 6.2 Manual check on a dev build: both metrics at mobile width in light and dark themes, an archived account with a balance, and a missing-rate currency. Verify: the section shows partial or unavailable states without breaking the rest of Profile.
- [ ] 6.3 `openspec validate st008-personal-financial-metrics --strict` passes.
