# Design

## Context

Billing periods are not stored. `buildCardBilling` (`apps/api/src/modules/accounts/utils/creditCardBilling.ts`) derives them on every read from the card's default cycle (`statementClosingDay`, `paymentDueRule`, `paymentDueValue`, `billingTimeZone`) via `creditCardCycle.ts`, where a period is identified by the month index of its closing date. `periodBounds` sets start = day after the previous closing; transaction allocation, closing debt, credit windows, status and the interest estimate all read those instants. API, MCP, `/v1` and the reminder worker share this one calculation. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Per-period override of closing date and due date, independently, that survives recalculation, new periods and default changes.
- One calculation path: no figure computed differently for overridden periods.

**Non-Goals:**
- Persisting periods or any derived figure.
- Overriding periods after the open one.
- MCP or `/v1` write tools, bulk edit, override history.

## Decisions

1. **Override table, not persisted periods.** `CreditCardPeriodOverride { id, userId, accountId, monthIndex Int, closingDate Date?, dueDate Date?, createdAt, updatedAt }`, `@@unique([accountId, monthIndex])`, `@@index([userId])`, account relation `onDelete: Cascade`. `monthIndex` is the existing identity (`year*12+month-1` of the default closing month); it stays stable when an override moves the effective closing into another month. A row exists only while at least one date is set (the service deletes it when both become null; no CHECK constraint, to avoid raw SQL). Rejected alternative: persist every period. It needs a generator, a backfill and a sync on every config or ledger change, and breaks the "nothing derived is persisted" invariant. The override table is one query and removes any recalculation-vs-override conflict because recalculation never touches rows.
2. **Resolve at the lowest level.** `CycleConfig` gains optional `overrides: Map<monthIndex, { closingDate?, dueDate? }>`. `closingDateOf` and `dueDateOf` return the override when present; `periodBounds`, the estimate window, `nextClose` and the open period follow unchanged. A due date without its own override follows the effective closing under `days_after_closing` and keeps its calendar rule under `day_of_next_month`.
3. **Contiguity by construction.** Start of period N is always `closing(N-1)+1 day`, so overriding an end moves the next start; validation only has to keep closings strictly increasing.
4. **`periodIndexContaining`** starts at the default guess and steps to a neighbour while the date lies after `closing(i)` or on/before `closing(i-1)`. With no overrides it returns exactly what it returns today.
5. **Continuity and validation: one pure function `validateCycleSequence(config, indexes)`.** For each index i in {N-1, N, N+1}: `closing(i-1) < closing(i)` and `closing(i) < due(i)`. A due date MAY fall after the next closing: boundaries and payment deadlines are independent, and a due date never constrains a neighbour. Closing-order violations are reported before due-date violations, so a closing on or before the previous closing names that rule rather than a neighbour's due date. Because the next start is always `closing(N-1) + 1 day`, shortening or lengthening A's end moves only B's start; B's end and every other period stay as they are. A due date never moves a boundary, and a boundary edit never changes any due date, stored or default. The payment window of period N ends at `max(close(N+1), due(N))` in `buildCardBilling`: a payment dated after the next closing and on or before the due date counts toward N (on time) and also toward N+1, which is correct because closing debts are cumulative and N+1's closing debt already contains N's unpaid remainder. Each entry is counted at most once within a period. The interest estimate's end date stays at `close(N+1)`. The ordering rules already bound drift and reject wrong-year typos, so no separate drift limit exists. The same function guards default-setting changes in `update.service.ts`: after merging, run it for every override key ±1 and reject with a 400 naming the period. Overrides are never dropped or clamped silently. Leaving the `credit_card` type deletes the account's overrides with the cleared card fields.
6. **API.** `PATCH /accounts/:id/credit-card/periods/:key` (`key` = `YYYY-MM` of the default closing month, returned on each period). Body `{ closingDate?: "YYYY-MM-DD" | null, dueDate?: "YYYY-MM-DD" | null }`, at least one field; absent = unchanged, `null` = reset to default. Shared Zod schema in `packages/shared/src/schemas/accounts.ts`, applied with `validate()`. Ownership: `account.findFirst({ where: { id, userId, type: "credit_card" } })` and override rows scoped by `userId`; 404 otherwise; a key after the open period is a 400. Validation and write run in one `Serializable` `prisma.$transaction` that re-reads the account's overrides; a serialization failure (`P2034`) is a 409 "retry", so two concurrent edits cannot jointly leave an invalid sequence and a failed write stores nothing. The response is the updated `BillingPeriod` row (through `serialize()`). Reset needs no DELETE route.
7. **Response fields.** `BillingPeriod` adds `key`, `endAdjusted`, `dueAdjusted`, `defaultEnd`, `defaultDue` (the default for that period ignoring only its own override). Existing fields keep their meaning.
8. **Effects on derivations (all automatic through decision 2).** Editing closing(N) changes the payment window of N-1, the content and closing debt of N and the start of N+1; later closing debts are unchanged because closing debt is the whole-ledger balance. Editing due(N) moves only N's on-time boundary, so only N's status, on-time remaining and estimate change. Confirmed interest follows period membership by date.
9. **Web.** Period end and Payment due are edited in place, with no extra column or expanding form. `BillingPeriodDateCell` renders the date as a button; activating it swaps in a native `<input type="date">` (autofocused, 16px on mobile via `editableControlClassName`). Enter or blur saves a changed value, Escape restores; the input is read-only while the mutation (including the refetch of the invalidated query) runs and the cell shows "Saving…". Errors render under the cell in an `aria-live` region and keep the typed value. Focus returns to the date button after save, cancel or reset. Adjusted dates show a compact "Adjusted" badge, the default date and a reset icon button with an aria-label. Period start stays a derived, read-only link. The table already stacks into labelled rows below `sm`, so the same cells serve mobile. Saving invalidates `["accounts","credit-card",accountId]`. Date arithmetic and validation stay on the API.
10. **Reminders** call `buildCardBilling` and need the overrides: `loadCardOverrides(userId, accountIds)` next to `loadCardEntries`, one extra query for all of a user's cards.

## Risks / Trade-offs

- Overriding a closed or paid period rewrites its historical figures. That is the purpose (the bank's dates win), but see the owner decision.
- Reminder dedupe keys use the closing date, so moving a closing date can allow one more reminder for that period. Accepted and documented.
- Concurrent edits are serialized by the database; the loser gets a retryable 409.
- A due date past the next closing makes two statements' windows overlap; a credit in the overlap lowers both statements' remaining amounts (intended, since the later statement carries the earlier remainder).
- Known limit: the card-level default `paymentDueValue` is still capped (`day_of_next_month` up to the closing day, `days_after_closing` up to 28) so the defaults never overlap; an issuer whose due date really falls after the next closing uses per-period due overrides.
- A default-setting change can be rejected because of overrides; the error names the blocking period and the owner resets it first.

## Owner decision

- Allow editing closed and paid periods, or only the open and latest closed one? Recommended: allow all, because the statement is the source of truth and the table flags adjusted rows.

## Migration

One Prisma migration creating the table. No backfill, no reset; existing rows are untouched.
