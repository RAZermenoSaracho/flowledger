# Tasks

## 1. Data model

- [x] 1.1 Add model `CreditCardPeriodOverride` to `database/prisma/schema.prisma` (unique `accountId, monthIndex`, `userId` index, cascade on user and account) and generate the migration with `npm run prisma:migrate`.
- [x] 1.2 Update `docs/DATA_MODEL.md` and the billing section of `docs/DOMAIN_LOGIC.md`.

## 2. Shared package

- [x] 2.1 Add `updateBillingPeriodSchema` (`closingDate`/`dueDate` as `YYYY-MM-DD` or null, at least one) and `billingPeriodKeySchema` (`YYYY-MM`) to `packages/shared/src/schemas/accounts.ts`; add `key`, `endAdjusted`, `dueAdjusted`, `defaultEnd`, `defaultDue` to `BillingPeriod` in `packages/shared/src/types/index.ts`.
- [x] 2.2 Tests in `packages/shared/src/schemas/tests/accounts.test.ts`: valid/invalid dates, empty body, null reset, bad key.

## 3. API calculation

- [x] 3.1 `types/creditCardBilling.types.ts`: add the override type and `overrides` on `CycleConfig`.
- [x] 3.2 `utils/creditCardCycle.ts`: resolve overrides in `closingDateOf`/`dueDateOf`; step-search `periodIndexContaining`; add `validateCycleSequence`.
- [x] 3.3 `utils/creditCardBilling.ts`: accept overrides, emit the new period fields (defaults computed without the period's own override).
- [x] 3.4 Tests in `utils/tests/creditCardCycle.test.ts` and `utils/tests/creditCardBilling.test.ts`: no-override output identical to today; end override moves next start; due-only override; `days_after_closing` follow-through; month/year boundary; day 31 short months; leap year; DST zone; allocation of a boundary transaction; paid/paid_late/overdue change; estimate window; validation failures (overlap, due before closing, due after next closing).

## 4. API services and routes

- [x] 4.1 `services/creditCard.read.service.ts`: `loadCardOverrides(userId, accountIds)` and pass overrides in `getCreditCardBilling`.
- [x] 4.2 New `services/creditCard.update.service.ts` (`updateBillingPeriodOverride`) in one `$transaction`: ownership in `where`, key at or before open period, validate neighbours, upsert or delete the row, return the updated period.
- [x] 4.3 New `controllers/creditCard.update.controller.ts` with `asyncHandler`, `serialize()`; route `PATCH /:id/credit-card/periods/:key` in `accounts.routes.ts` with `validate(updateBillingPeriodSchema)`.
- [x] 4.4 `services/update.service.ts`: run `validateCycleSequence` over existing overrides when card fields change; delete overrides when leaving `credit_card`.
- [x] 4.5 `notifications/services/creditCardReminders.service.ts`: load and pass overrides.
- [x] 4.6 Tests: `services/tests/creditCard.update.service.test.ts` and `creditCard.read.service.test.ts` (mockDeep Prisma: ownership/404, upsert, delete on double reset, rejections, future key); `services/tests/update.service.test.ts` (blocked default change, cleanup on type change); `controllers/tests/creditCard.update.controller.test.ts`; `notifications/services/tests/creditCardReminders.service.test.ts` (overridden due date used).

## 5. API integration tests (Docker, run later)

- [x] 5.1 In `apps/api/src/tests/integration/creditCard.integration.test.ts`: persisted override reflected in GET, survives default change and new period, other user gets 404, cascade on account delete, `/v1` and MCP read show identical figures.
- [x] 5.2 In `financialIsolation.integration.test.ts`: user B cannot read or write user A's overrides.

## 6. Web

- [x] 6.1 `services/creditCard.client.ts`: `updateBillingPeriod(accountId, key, body)`; test in `services/tests` with msw.
- [x] 6.2 `pages/Accounts/hooks/useUpdateBillingPeriod.ts`: mutation invalidating `["accounts","credit-card",accountId]`; hook test.
- [x] 6.3 `pages/Accounts/components/BillingPeriodDateCell.tsx`: in-cell date button turning into a native date input (Enter/blur save, Escape cancel, saving state, inline error keeping the value, Adjusted badge, reset icon, focus return); component test with user-event (click, type, Enter, Escape, blur, error, reset, keyboard-only). No separate editor or "Adjust dates" column.
- [x] 6.4 `CreditCardPeriodsTable.tsx`: "Adjusted" badge with default, in-cell editing, mobile stacked layout; extend its tests; update `src/tests/fixtures/creditCardBilling.ts` for new fields.

## 6b. UX correction and domain checks

- [x] 6b.1 Remove `BillingPeriodDatesEditor` and the "Adjust dates" column; edit Period end and Payment due in place.
- [x] 6b.2 `validateCycleSequence` reports closing-order errors before due-date errors.
- [x] 6b.3 `updateBillingPeriodOverride` runs Serializable; `P2034` maps to 409. Tests: continuity example (A 2026-10-21..2026-11-20, B 2026-11-21..2026-12-20, A end 2026-11-19), unrelated overrides preserved, rollback, zone, concurrency integration test.

## 6c. Independent boundaries and deadlines

- [x] 6c.1 `validateCycleSequence`: drop the "due not after the next closing" rule; keep strictly increasing closings and due after its own closing.
- [x] 6c.2 `buildCardBilling`: a closed period's payment window ends at `max(close(N+1), due(N))`; the interest estimate end date is unchanged.
- [x] 6c.3 Tests: the six institution periods in several edit orders, a due override past the next closing, a payment inside the overlap (per-statement figures, no double count within a period), a closing edit writes one row and never changes a due date, no false overdue reminder.
- [x] 6c.4 Update the delta spec (MODIFIED boundary and payment requirements), design, proposal and `docs/DOMAIN_LOGIC.md`.

## 6d. Implementation-quality review

- [x] 6d.1 One exported `parseLocalDate` in `creditCardCycle.ts` replaces the private copies in `creditCardBilling.ts` and `creditCard.update.service.ts`.
- [x] 6d.2 A card cycle-field change loads the overrides, validates and writes in one Serializable transaction; `mapSerializationConflict` (accounts `utils/`) maps `P2034` to 409 for both edit paths.
- [x] 6d.3 Tests: interest estimate unchanged by a due date after the next closing, reset of both dates in one request, Serializable and 409 on a cycle change.

## 7. Verification

- [x] 7.1 `npm run typecheck`, `npm run lint`, targeted `npm run test` per workspace.
- [ ] 7.2 Staging checks with a throwaway card (never PLATA CARD): override end and due, reload, move default closing day, reset, try an overlapping value, view at mobile width, confirm reminders and the Transactions period filter use the adjusted dates.
