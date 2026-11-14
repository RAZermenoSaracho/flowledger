# Design

## Context

See `proposal.md` for motivation. These facts from the codebase constrain the design:

- `calculateAccountBalance` (`transactions/utils/transactionCalculations.ts`) computes `initialBalance + income.accountAmount − (expense | transfer-out).accountAmount + transfer-in.destinationAmount` in `Prisma.Decimal`. The accounts list and net worth both use it, and card debt is already a negative balance.
- A transfer is one row (`accountId` → `transferToAccountId`). Reports drop transfers through `REPORT_TRANSACTION_TYPES` (`reports/utils/reportFilters.ts`) and `isReportTransactionType` (`transactionCalculations.ts`).
- `Transaction` indexes are `[userId, date]`, `[accountId]` and `[transferToAccountId]`.
- All write paths store the same `Transaction` shape. They are web, `/v1`, MCP, the Notification Model worker (through `createTransaction`), provider import and settlement approval.
- `Notification` has no dedupe key. The B-007 worker (`notificationRunWorker.ts`) runs a 60 s maintenance timer, and that timer is the only multi-process-safe periodic hook.
- Neither the user nor the account has a time zone. `transaction-datetime` stores UTC instants, and a bare date means `00:00Z`.

## Goals / Non-Goals

**Goals:**
- The ledger is the only financial state.
- Billing is a pure function of (card configuration, card transactions, now).
- One calculator is shared by the API, MCP, the web app and the worker.

**Non-Goals:**
- Statement records or snapshots, and payment or allocation tables.
- Statement editing, and issuer-confirmed amounts.
- Minimum payments.
- Installment, promotional or deferred-interest balances.
- Late-fee rules and automatic interest posting.
- Import auto-merge and booking imports as transfers. An imported expense can already be edited into a transfer with the existing update.
- `creditCardKind` on Notification Model script helpers. Card income created by scripts is an "other credit" until labeled, and every figure is correct regardless.
- Migrating misclassified test data (pre-production data policy).

## Decisions

### D1. Billing is a read-time projection

A pure util, `accounts/utils/creditCardBilling.ts`, has this signature:

`buildCardBilling(config, initialBalance, entries, now, page)` → `{ metrics, openPeriod, periods[], current }`

- `entries` are the card's transactions, reduced to `{ date, delta, role }`:
  - `delta` is the signed effect on the card balance, in card currency, from the persisted `accountAmount` / `destinationAmount`;
  - `role` is `charge`, `credit` or `interest`; credits also carry their breakdown kind: transfer, payment, refund, cashback or other.
- **One balance formula:** the per-transaction signed effect is extracted from `calculateAccountBalance` into `transactionBalanceDelta(tx, accountId)`. Both `calculateAccountBalance` and the calculator use it, so there is no second balance formula. `metrics` equals `calculateAccountBalance` by construction.
- **One loader:** `loadCardEntries(userId, accountIds)` is shared by the read service and the reminder worker. It runs the two indexed queries and supports a batch of cards.

**Why:** no state can drift, every ingestion path is covered by construction, and edits are reflected immediately.

**Alternative rejected:** stored statements. They are rejected by the product decision; their only benefit, frozen history, is explicitly not wanted.

### D2. Boundaries: half-open intervals in the billing time zone

`accounts/utils/creditCardCycle.ts` is pure and needs no new dependency, since it uses `Intl.DateTimeFormat` to resolve offsets. It defines:

- `closingDate(y, m) = min(closingDay, daysIn(y, m))`;
- `close(N)` = the local start of the day after the closing date;
- `due(N)` = the local start of the day after the due date;
- period N = [`close(N−1)`, `close(N)`) and window N = [`close(N)`, `close(N+1)`).

Configuration validation guarantees `due(N) ≤ close(N+1)`:
- `day_of_next_month` requires a value ≤ `closingDay`;
- `days_after_closing` requires a value ≤ 28, because the shortest cycle is 28 days.

This keeps on-time payment windows disjoint. `billingTimeZone` lives on the account because the issuer's day boundary is a property of the card, and there is no user time zone.

Bare-date transactions (`00:00Z`) are classified by their instant, matching how the app already displays them. Rejected alternative: a special case for them.

### D3. Closing debt is the balance at the boundary, not the sum of the period

`closingDebt(N) = max(0, −B(close(N)))`, where `B(t) = initialBalance + Σ delta` over entries dated before `t`.

This includes carried-over debt, pre-closing payments and refunds, transfers out, interest and fees. Each one is counted once, at its date.

### D4. Allocation by disjoint windows, with one target per transaction

Every credit (a transfer into the card, or any card income) dated in window N counts toward period N only. All credits reduce the obligation equally; this is a product decision.

- `remaining(N) = max(0, closingDebt(N) − credits(N))`;
- `onTimeRemaining(N)` uses only [`close(N)`, `due(N)`);
- `creditsByKind(N)` is the same set split into transfers, external payments, refunds, cashback and other credits. It is informational only.

**Why this is double-count-free:**
- The windows partition time after the first closing, so every credit is counted toward exactly one period.
- A credit dated before `close(N)` is already inside `closingDebt(N)` and lies in an earlier window, never in N's.
- `closingDebt(N+1)` already contains N's unpaid remainder. The current amount owed is therefore the latest closed period's `remaining`, never a sum. Earlier unpaid periods stay `overdue` as history, labeled as carried into later periods.
- Because every credit counts, `remaining(N) ≤ debt` holds at every instant in window N.

**Rejected alternative:** oldest-first FIFO across all unpaid periods. Because closing debts are cumulative, FIFO would allocate the same debt twice. It would also need either stored allocation state or a second, inconsistent model.

### D5. Minimal classification: one nullable enum on `Transaction`

`creditCardKind` takes these values:

| Value | Allowed on | Purpose |
|---|---|---|
| `payment` | income on a card | external payment (label and breakdown) |
| `refund` | income on a card; requires `expenseOffsetCategoryId` | merchant refund. It reuses the existing reimbursement offset, so Net Expenses fall. |
| `cashback` | income on a card | reward credit (label and breakdown) |
| `interest` | expense on a card | confirmed interest, reported per period apart from the estimate |
| null | anything | ordinary entry. On card income it means "other credit". |

A transfer into a card is a repayment, and its value stays null. The classification never changes a balance or a billing figure. It is validated in `prepareTransactionInput`, which already loads the accounts, so every write path enforces it.

**Why not fewer values:** the product requires the refund/cashback/payment breakdown, and `refund` is what ties a card refund to the existing net-expense offset. A refund without a category would leave Net Expenses overstated.

**Rejected alternatives:**
- Categories as the marker: categories are user-editable, and there is no system category.
- A `fee` value: a fee is a plain expense, so YAGNI.
- A sourceless transfer: rejected by the product decision.

### D5b. Reporting: exclude card income from income totals, keep reimbursement offsets

The existing semantics are:
- `amountMode` is `gross` or `net`;
- Gross Income is all income;
- Net Income is income without `expenseOffsetCategoryId`;
- Net Expenses = gross expenses − reimbursements, where reimbursements are offset income;
- `currentBalance` = gross income − gross expenses;
- `/transactions/summary` sums by type with no gross/net concept.

The smallest compatible change is one shared Prisma fragment in `reports/utils/reportFilters.ts`, `nonCardIncomeWhere = { account: { type: { not: "credit_card" } } }`:
- **Where it applies:** the income-total queries of the summary and by-category reports, `cashflowReportWhere`, the financial-overview savings-rate query, and the income bucket of `/transactions/summary`.
- **`calculateMonthlyCashflow`:** it gains the account type in its input, so it skips card income for income totals.
- **Reimbursements:** the reimbursement (`offsetReportWhere`) path does not apply the fragment, so a card refund with an offset category still reduces Net Expenses.
- **New figure:** one `creditCardCredits` aggregate (transfers into cards and card income, grouped by kind) is added to the report summary only. It is the same in Gross and Net modes. The transactions-list summary just drops card income from its income bucket.

Non-card reporting is unchanged by construction, because the fragment matches only card rows. The changes are spread over about five call sites; adding a central predicate everywhere would mean refactoring unrelated reports.

### D6. Interest estimate: average daily balance over the payment window

The estimate applies when a rate is set and `onTimeRemaining > 0`. While the period is before its due date, the current `remaining` is used as a projection.

`estimate = rate/100/365 × Σ_days EOD debt`, summed over the local days of window N. Days after `now` use the current debt. The result is rounded to the currency's precision.

The model assumes the grace period is lost on the whole average daily balance, which is how ordinary revolving cards behave. The response lists the assumptions: no tax, and no installment, promotional or deferred-interest balances. With no rate, the estimate is `unavailable`, and it is never persisted.

**Rejected alternative:** `unpaid × rate × days`. It understates the cost of losing the grace period.

### D7. Reminders: worker maintenance plus a database dedupe key

- **Dedupe key:** `Notification.dedupeKey String?` with `@@unique([userId, dedupeKey])`, and `createNotifications` uses `skipDuplicates`.
- **Service:** `notifications/services/creditCardReminders.service.ts`:
  - It loads the configured, active cards and their entries through the shared `loadCardEntries`.
  - It runs `buildCardBilling` for each card and evaluates two periods: the latest closed period, for closed, due-soon, partial and paid; and the most recent period whose due boundary has passed, for overdue. When the due date equals the next closing (Plata), these are different periods.
  - It emits keys of the form `cc:<type>:<accountId>:<closingDate>`.
- **Schedule:** `NotificationRunWorker`'s maintenance timer calls it on every run.
  - `ponytail:` it evaluates all configured cards every 60 s. When card counts grow, pre-filter by the date windows, which the configuration alone determines.
- **Safety:** restarts, repeated runs and multiple workers are made safe by the unique key. Because the key omits amounts, later edits to history never resend an event.

**Rejected alternatives:**
- A new scheduler. The Syncfy scheduler is env-gated and runs in a single instance.
- Per-period "notified" rows. Those would be a second state.

### D8. One endpoint, with period drill-down through existing lists

`GET /accounts/:id/credit-card?page=` (12 periods per page) returns the metrics, the open period, the current amount to avoid interest and the paged periods. `/v1` mirrors it, and MCP adds `get_credit_card`.

There are no payment, statement or match endpoints. Purchases, payments, refunds and interest go through the existing transaction CRUD.

Period drill-down opens the account's Transactions tab, using the existing `RelatedTransactionsList` with a date-range condition added to its datasieve scope. That scope covers both `accountId` and `transferToAccountId`, so incoming transfers are included.

### D9. Possible duplicates: read-only hints on the existing imported list

The imported-list read service adds `possibleDuplicates` to the pending rows on the page, at most 3 per row. A match has the same owner, involves the account, has an equal applied amount, falls within ±5 days and is not linked to an import. It is computed with one batched query per page. The existing ignore action resolves a duplicate.

**Rejected alternative:** a match or link endpoint. Ignore already prevents double counting, and a match endpoint is more surface for no accounting gain.

### D10. Web

The new files sit in `pages/Accounts/` and are each under about 300 lines:
- `components/CreditCardSection.tsx`: registered through `AccountTypeSections`, sharing the same draft and Save;
- `components/CreditCardTab.tsx`: shows the metrics, the actions, and the periods table on the shared list or table components, with stacked records on mobile;
- `hooks/useCreditCard.ts` and `services/creditCard.client.ts`.

Changes to existing files:
- `transactionPrefill.ts` gains `transferToAccountId` and `creditCardKind`.
- The coupling util adds the "Card entry" field.
- Import review shows the hints.
- Notification labels and targets are added.

The web app computes no figures.

## Accounting verification

All amounts are MXN. The setup is: limit 30,000, closing day 20, due on the 20th of the next month, time zone `America/Mexico_City`, rate 60%. NW means net worth.

| # | Situation | Result |
|---|---|---|
| 1 | Debit 20,000 and the card at 0. Purchase of 5,000. | Debit 20,000. Debt 5,000. Available 25,000. Expense +5,000. NW −5,000. |
| 2 | Card income of 500 `refund`, offset category Shopping. | Debt 4,500. Not income. Net Expenses fall by 500. Credits breakdown: refunds 500. |
| 3 | Transfer of 1,000 from debit, made before the Oct-20 closing. | Debt 3,500. Oct closing debt 3,500, so 5,000 − 500 − 1,000. The 1,000 is not counted again after closing. |
| 4 | Oct 25 purchase of 2,000. | Oct closing debt stays 3,500. The 2,000 lands in the Oct 21 – Nov 20 period. |
| 5 | Nov 1 transfer of 2,000. | Oct window: credits 2,000, remaining 1,500, `partially_paid`. Debt 3,500. |
| 6 | Nov 10 transfer of 1,500. | Oct remaining 0, `paid`. Debt 2,000, which is only the post-closing purchase. |
| 7 | A closes Jan 20 with 10,000. Feb 1 payment of 4,000, Feb 5 purchase of 3,000, nothing more by Feb 20. | A: payments 4,000, remaining 6,000; `overdue` from Feb 21. B closes Feb 20 at 9,000 (6,000 carried + 3,000). No transaction is created. |
| 8 | Mar 1 payment of 9,000. | It counts toward B only. B is `paid`, and A stays `overdue` as history (its 6,000 was carried into B). Payments total 13,000, against 13,000 charged. |
| 9 | Estimate for A. | EOD debts: 11 days × 10,000, 4 × 6,000 and 16 × 9,000, so Σ 278,000. 278,000 × 0.60 / 365 = **456.99**, labeled "Estimated". Debt, available and NW are unchanged. |
| 10 | Confirmed interest: expense of 457 `interest`, Feb 20. | Debt +457, available −457, expense +457, NW −457. B shows confirmed interest 457. |
| 11 | After row 6, the Nov 1 payment is edited to 1,000, then deleted. | Oct remaining 1,000 (3,500 − 1,000 − 1,500), then 2,000. Debt becomes 3,000, then 4,000. Reminders already sent are not resent. |
| 12 | Backdated 800 purchase dated Oct 15, entered Dec 1. | Oct closing debt becomes 4,300, and every later period is recalculated. |
| 13 | Income of 6,000 classified `payment` (external). | Same billing effect as a transfer. Not Gross or Net income; `creditCardCredits` +6,000. NW +6,000, because money from outside reduced the debt. |
| 14 | A USD account pays 300 USD into the MXN card, `destinationAmount` 5,400. | Credits +5,400 MXN. No rate is used. |
| 15 | Overpayment of 15,000 on 12,000 of debt with a 10,000 closing debt. | `paid`, debt 0, credit balance 3,000, available 33,000. |

The reporting scenarios (salary with a card payment, external payment, refund, cashback, no duplicate expense) are worked through in `specs/credit-card-accounts/spec.md`.

**Boundaries:**
- Day 31 closes Feb 28 2027 and Feb 29 2028.
- The period closing Dec 20 2026 is due Jan 20 2027.
- 23:59 local on the 20th belongs to the closing period; 00:00 on the 21st belongs to the next.

## Financial invariants

1. Every change to a card's debt is exactly one ordinary `Transaction`. Billing never writes money.
2. All billing figures are pure functions of the configuration, the ledger and `now`. The API, MCP, the web app and the worker share one function.
3. Each credit entry counts toward at most one period, because the windows are disjoint and every credit has one date.
4. `remaining(N) ≤` debt at any instant in window N. The current amount owed (the latest closed period's remaining) therefore never exceeds the debt. An older period's remaining amount is history and is never asked for.
5. Transfers into cards and all card income are never Gross or Net income. A card refund with an offset category reduces Net Expenses through the existing reimbursement mechanism. Interest is always an expense. Pending imports affect nothing.
6. Available credit and estimates never enter net worth, cash or reports.
7. A notification event per (user, type, card, closing date) is sent at most once, enforced by the database.
8. Applied amounts come only from persisted native amounts (B-006). Rounding happens only for the displayed estimate.

## Performance

- **Per request:** two indexed queries (`accountId = card` and `transferToAccountId = card`), selecting six columns. The calculator then sorts by date in memory and makes one linear pass to compute every boundary balance and every window sum. Page selection happens after the pass. There are no N+1 queries and no cache.
- **Expected cost:** a personal card has hundreds to low thousands of rows a year, so this is O(n) in a few milliseconds.
- **Upgrade path, when a card exceeds ~50k rows:** add composite indexes `[accountId, date]` and `[transferToAccountId, date]`, and replace the prefix before the requested page with two `SUM` aggregates. No persisted balances are needed.
- **Worker:** the same queries are batched over all configured cards, once per maintenance run.

## Risks / Trade-offs

- **[Credits inside a window]** Any refund dated in window N lowers N's remaining amount, even when it refunds a purchase made after closing. This understates N's remaining amount, never the debt. It was chosen over excluding refunds, because the exclusion could ask for more than is owed.
- **[Bare-date transactions]** A date-only `2027-01-21` is stored as `00:00Z`, which is 2027-01-20 18:00 in Mexico City. It therefore falls in the period that closes on the 20th, exactly as the app already displays it. Keeping it consistent with `transaction-datetime` was chosen over a 00:00Z special case. Clients that send local datetimes are unaffected.
- **[History changes after edits]** This is accepted by product decision. Reminders are keyed so that they never resend.
- **[Issuer amounts differ]** Minimum payments, installment plans, promotions and tax are not modeled. The app shows "amount to avoid interest (ordinary revolving basis)" and documents the limitation, and nothing is fabricated.
- **[Estimate model]** The average daily balance with grace lost can overstate the cost for issuers that charge only on the unpaid amount. It is labeled and its assumptions are listed.
- **[Unclassified booked imports]** A booked Syncfy card credit without a kind shows as "other credit" until the user labels it. Debt, billing and income totals are correct regardless, because card income is never income.
- **[Due after the next closing]** Rare issuer schedules where the due date falls after the next closing are rejected by validation. Supporting them would need overlapping windows.
- **[The worker evaluates every card every 60 s]** This is cheap at current scale. The `ponytail:` comment records the pre-filter upgrade.

## Migration Plan

1. Create one additive Prisma migration, `b008_credit_cards`, adding:
   - six nullable `Account` columns and the `PaymentDueRule` enum;
   - `Transaction.creditCardKind` and the `CreditCardKind` enum;
   - `Notification.dedupeKey` and its unique index;
   - five `NotificationType` values.

   It has no backfill and no data change.
2. Deploy in the usual order: migrate → build → API → worker. To roll back, revert the code; the nullable columns are inert.
3. Seed: one configured card, with purchases before and after a closing, and one transfer payment.
