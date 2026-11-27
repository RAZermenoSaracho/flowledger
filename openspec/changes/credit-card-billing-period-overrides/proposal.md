# Proposal

## Why

Banks sometimes close a statement or set a payment due date off the card's default cycle (task #195, observed on a production card). The Credit card tab shows computed dates for every billing period with no way to correct them, so allocation, amount to avoid interest, status and reminders drift from the real statement.

## What Changes

- Store optional per-period overrides of **Period end** and **Payment due** (independently) in one small table keyed by card and the period's identity. Billing periods stay derived on read; only the overridden dates are stored.
- The billing calculation resolves each period's closing and due date as override-or-default. The next period starts the day after the effective end, so periods never gap or overlap, and every derived figure (allocation, closing debt, credits, remaining, status, interest estimate and confirmed interest, reminders, MCP and `/v1` output) follows without separate code.
- New endpoint `PATCH /accounts/:id/credit-card/periods/:key` sets or resets (null) either date. Writes are rejected when closings would stop strictly increasing or a due date would not follow its own closing. Boundaries and payment deadlines are independent: a due date may fall after the next period's closing, in which case the period's payment window extends to its due date.
- Changing the card's default cycle fields is rejected when it would invalidate an existing override; otherwise defaults keep applying to every period without an override.
- Billing periods table: Period end and Payment due are edited directly in their cells (click the date, native date input, Enter/blur saves, Escape cancels, inline saving and error states); an "Adjusted" badge, the default and a reset icon stay in the cell. Period start remains derived (previous end + 1 day) and not editable. No extra column.
- Each period in the billing response gains `key`, `endAdjusted`, `dueAdjusted`, `defaultEnd`, `defaultDue`.

## Capabilities

### New Capabilities

### Modified Capabilities
- `credit-card-billing`: per-period overrides of closing and due dates, their validation, effect on derived figures, and the edit endpoint.
- `account-form-view`: editing, marking and resetting overrides in the Billing periods table.

## Impact

- `database/prisma/schema.prisma` plus one migration (new table `CreditCardPeriodOverride`; no data reset, no backfill).
- API `accounts` module: `utils/creditCardCycle.ts`, `utils/creditCardBilling.ts`, `types/creditCardBilling.types.ts`, `services/creditCard.read.service.ts`, new `services/creditCard.update.service.ts` and controller, `accounts.routes.ts`, `services/update.service.ts`; `notifications/services/creditCardReminders.service.ts` (pass overrides).
- `packages/shared`: new schemas, `BillingPeriod` type fields.
- Web `pages/Accounts`: `CreditCardPeriodsTable.tsx`, `BillingPeriodDateCell` and `useUpdateBillingPeriod` hook, `services/creditCard.client.ts`.
- `docs/DATA_MODEL.md`, `docs/DOMAIN_LOGIC.md` (billing section).
