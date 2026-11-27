# Tasks

## 1. Data model

- [ ] 1.1 Add model `CreditCardPeriodOverride` to `database/prisma/schema.prisma` (unique `accountId, monthIndex`, `userId` index, cascade on user and account) and generate the migration with `npm run prisma:migrate`.
- [ ] 1.2 Update `docs/DATA_MODEL.md` and the billing section of `docs/DOMAIN_LOGIC.md`.

## 2. Shared package

- [ ] 2.1 Add `updateBillingPeriodSchema` (`closingDate`/`dueDate` as `YYYY-MM-DD` or null, at least one) and `billingPeriodKeySchema` (`YYYY-MM`) to `packages/shared/src/schemas/accounts.ts`; add `key`, `endAdjusted`, `dueAdjusted`, `defaultEnd`, `defaultDue` to `BillingPeriod` in `packages/shared/src/types/index.ts`.
- [ ] 2.2 Tests in `packages/shared/src/schemas/tests/accounts.test.ts`: valid/invalid dates, empty body, null reset, bad key.

## 3. API calculation

- [ ] 3.1 `types/creditCardBilling.types.ts`: add the override type and `overrides` on `CycleConfig`.
- [ ] 3.2 `utils/creditCardCycle.ts`: resolve overrides in `closingDateOf`/`dueDateOf`; step-search `periodIndexContaining`; add `validateCycleSequence`.
- [ ] 3.3 `utils/creditCardBilling.ts`: accept overrides, emit the new period fields (defaults computed without the period's own override).
- [ ] 3.4 Tests in `utils/tests/creditCardCycle.test.ts` and `utils/tests/creditCardBilling.test.ts`: no-override output identical to today; end override moves next start; due-only override; `days_after_closing` follow-through; month/year boundary; day 31 short months; leap year; DST zone; allocation of a boundary transaction; paid/paid_late/overdue change; estimate window; validation failures (overlap, due before closing, due after next closing).

## 4. API services and routes

- [ ] 4.1 `services/creditCard.read.service.ts`: `loadCardOverrides(userId, accountIds)` and pass overrides in `getCreditCardBilling`.
- [ ] 4.2 New `services/creditCard.update.service.ts` (`updateBillingPeriodOverride`) in one `$transaction`: ownership in `where`, key at or before open period, validate neighbours, upsert or delete the row, return the updated period.
- [ ] 4.3 New `controllers/creditCard.update.controller.ts` with `asyncHandler`, `serialize()`; route `PATCH /:id/credit-card/periods/:key` in `accounts.routes.ts` with `validate(updateBillingPeriodSchema)`.
- [ ] 4.4 `services/update.service.ts`: run `validateCycleSequence` over existing overrides when card fields change; delete overrides when leaving `credit_card`.
- [ ] 4.5 `notifications/services/creditCardReminders.service.ts`: load and pass overrides.
- [ ] 4.6 Tests: `services/tests/creditCard.update.service.test.ts` and `creditCard.read.service.test.ts` (mockDeep Prisma: ownership/404, upsert, delete on double reset, rejections, future key); `services/tests/update.service.test.ts` (blocked default change, cleanup on type change); `controllers/tests/creditCard.update.controller.test.ts`; `notifications/services/tests/creditCardReminders.service.test.ts` (overridden due date used).

## 5. API integration tests (Docker, run later)

- [ ] 5.1 In `apps/api/src/tests/integration/creditCard.integration.test.ts`: persisted override reflected in GET, survives default change and new period, other user gets 404, cascade on account delete, `/v1` and MCP read show identical figures.
- [ ] 5.2 In `financialIsolation.integration.test.ts`: user B cannot read or write user A's overrides.

## 6. Web

- [ ] 6.1 `services/creditCard.client.ts`: `updateBillingPeriod(accountId, key, body)`; test in `services/tests` with msw.
- [ ] 6.2 `pages/Accounts/hooks/useUpdateBillingPeriod.ts`: mutation invalidating `["accounts","credit-card",accountId]`; hook test.
- [ ] 6.3 `pages/Accounts/components/BillingPeriodDatesEditor.tsx`: date inputs, Save/Cancel, per-date reset, error display; component test (save, cancel, error keeps values, reset).
- [ ] 6.4 `CreditCardPeriodsTable.tsx`: "Adjusted" badge with default, edit action, mobile stacked layout; extend its tests; update `src/tests/fixtures/creditCardBilling.ts` for new fields.

## 7. Verification

- [ ] 7.1 `npm run typecheck`, `npm run lint`, targeted `npm run test` per workspace.
- [ ] 7.2 Staging checks with a throwaway card (never PLATA CARD): override end and due, reload, move default closing day, reset, try an overlapping value, view at mobile width, confirm reminders and the Transactions period filter use the adjusted dates.
