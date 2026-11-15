# Proposal

## Why

Today a credit card is an ordinary account with a negative balance. FlowLedger cannot show a limit, available credit, billing periods, due dates, payment progress or interest exposure. B-008 (ST-013 + ST-014) makes credit cards first-class liabilities as a **read-time projection of the existing ledger**. It adds no statement records, payment model or stored balances, so it cannot contradict the transactions it is derived from.

## What Changes

**Card configuration on the account (ST-013/ST-014):**
- Credit-card accounts gain these nullable fields:
  - credit limit;
  - statement closing day;
  - due-date rule and value;
  - billing time zone;
  - annual interest rate.
- The fields are editable on the web app, `/v1` and MCP, and are rejected on other account types.
- The due date must fall on or before the next closing date.

**Derived card metrics:** outstanding debt, credit balance, available credit (limit + signed balance), utilization and over-limit state, computed from the existing `calculateAccountBalance`.

**Card entry classification:**
- A new nullable `Transaction.creditCardKind`:
  - `payment`, `refund` or `cashback` on card income;
  - `interest` on card expense.
- The kind is informational, so every card credit reduces debt and the billing obligation equally.
- A `refund` requires the existing `expenseOffsetCategoryId`, so it reduces Net Expenses.
- A transfer into a card is always a repayment.

**Gross/Net reporting:**
- Card income is never Gross or Net income.
- Existing reimbursement offsets still apply to card refunds.
- A separate `creditCardCredits` figure (transfers, external payments, refunds, cashback, other) is added to the report summary.
- Non-card reporting is unchanged.

**Syncfy:** pending imports affect nothing until booked. A booked card credit is ordinary card income that needs no category.

**Dynamic billing calculator:** for each billing period it derives these values from the ledger in the card's time zone:
- start, closing date and due date;
- closing debt: the whole-ledger balance at the closing boundary;
- all credits in the payment window, with an informational breakdown;
- remaining to avoid interest;
- status: open, pending, partially paid, paid, paid late, overdue;
- confirmed interest;
- an average-daily-balance interest estimate.

It uses half-open intervals and disjoint payment windows, so each transaction counts toward one period only. Historical periods are recalculated whenever transactions change, by design.

**Reminders:**
- The existing notification worker evaluates each card's latest closed period, and the most recent period whose due date has passed.
- There are five new `NotificationType` values: closed, due soon (3 days), partially paid, paid, overdue.
- They are deduplicated by a new `Notification.dedupeKey` (`type:accountId:closingDate`), unique per user.

**API:** one read endpoint, `GET /accounts/:id/credit-card`, with `/v1` and MCP `get_credit_card` mirrors. Payments, refunds and interest use the existing transaction CRUD. Pending imported rows list possible duplicates; existing ignore resolves them.

**UI:**
- A "Credit card" section on the account's General tab.
- A "Credit card" tab with metrics, the billing-periods table, period drill-down to the existing Transactions list, and Pay / Record external payment / Record interest charge actions that open prefilled transaction drafts.
- A "Card entry" field in the transaction form for card income and expense.

**Debit-card inference fix:** `normalizeAccountType` checks `debit|débito` before `card|tarjeta`.

**Roadmap:** ST-013, ST-014 and B-008 describe this design.

## Capabilities

### New Capabilities
- `credit-card-accounts`: configuration fields, derived metrics, transaction semantics on cards, `creditCardKind`, net-worth treatment, debit-card classification.
- `credit-card-billing`: period boundaries, closing debt, payment windows and allocation, status and carry-forward, recalculation, interest estimate, confirmed interest, possible duplicates, the billing endpoint and its cost bounds.
- `credit-card-reminders`: dynamic, database-deduplicated billing notifications from the existing worker.

### Modified Capabilities
- `account-form-view`: credit-card section and Credit card tab.
- `transaction-form-view`: `transferToAccountId` and `creditCardKind` prefill, and the "Card entry" coupling.
- `public-rest-api`: adds `GET /v1/accounts/:id/credit-card`.
- `mcp-personal-tools`: adds `get_credit_card`; account and transaction tools accept the new fields.

## Impact

- **Database:** one additive migration, with no backfill and no data change. It adds:
  - six nullable `Account` columns and the `PaymentDueRule` enum;
  - `Transaction.creditCardKind` and its `CreditCardKind` enum;
  - `Notification.dedupeKey` with `@@unique([userId, dedupeKey])`;
  - five `NotificationType` values.
- **apps/api:**
  - `accounts`: the cycle and billing utils, a billing read service, a controller and one route;
  - transactions validation for `creditCardKind`;
  - the report filters (`reportFilters.ts`, `calculateMonthlyCashflow`, financial overview, transactions summary), which exclude card income and add `creditCardCredits`;
  - the import path and `needsClassification`, which need no category for card income;
  - the imported-list read service, which adds possible duplicates;
  - notifications: dedupe-aware create and a reminder service, called from `NotificationRunWorker` maintenance;
  - the `v1` route and the MCP tool.
- **packages/shared:** account and transaction schema fields.
- **apps/web:**
  - the account `CreditCardSection` and `CreditCardTab`;
  - prefill keys and the Card entry coupling;
  - a possible-duplicate hint in import review;
  - notification labels and targets.
- **Docs:** `docs/DATA_MODEL.md` and `docs/DOMAIN_LOGIC.md`; `SHORT_TERM_ROADMAP.md` is already updated.
- **No new dependencies, processes, schedulers, tables or environment variables.**
