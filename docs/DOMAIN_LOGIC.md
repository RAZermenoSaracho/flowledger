# Domain Logic

---

## Groups

Groups are the multi-user collaboration unit in FlowLedger. They replace the old "Household" concept — never introduce that term.

- A Group has one owner (`ownerUserId`) and any number of members (`GroupMember`).
- Groups own categories (`Category.groupId`). Group members can use these categories.
- Transactions can be scoped to a group (`Transaction.groupId`). Group transactions appear in group reports.
- Groups can be archived (soft delete).
- Group admin: Group admins (members with role `admin`) can update, archive, restore or delete the group and add members and categories.

### Membership rules
- Only group members can access group categories or create group-scoped transactions.
- The `getGroupMembership()` helper in `groups/services/read.service.ts` enforces this in transaction and category operations.

---

## Categories

Two scopes:

1. **Personal categories** — `groupId = null`. Accessible to one user via `CategoryUser` join.
2. **Group categories** — `groupId` set. Accessible to all group members.

Categories have a `type` (`income` or `expense`). This type is enforced when assigning categories to transactions and imported transactions.

### Expense offset categories

An income transaction can have an `expenseOffsetCategoryId`. This is used for settlement income transactions — the creditor receives money that "offsets" an expense in a specific category (e.g., "Received rent payment → offset Housing expense").

In reports, expense offset amounts are subtracted from the expense category's net total and from the income category's net total, preventing double-counting of settlement flows.

---

## Transactions

| Type | Accounts | Category |
|---|---|---|
| `income` | `accountId` optional | Required (unless group transaction) |
| `expense` | `accountId` optional | Required (unless group transaction) |
| `transfer` | Both `accountId` AND `transferToAccountId` required | None allowed |

Transfers: cannot have categories, groups, or shared expenses. Source and destination accounts must differ.

### Date and time

`Transaction.date` is a UTC instant. The web app converts it to and from the device timezone for display and entry, and always sends a full UTC ISO instant on writes.

- **Writes:** a bare `YYYY-MM-DD` means 00:00 UTC; an offset datetime is normalized to its UTC instant. An update that omits `date` preserves the stored value.
- **Range filters:** `dateFrom` is inclusive. A datetime `dateTo` is exclusive; a bare `dateFrom`/`dateTo` covers whole UTC days. The web app sends instants for local-day boundaries (the start of the local day, and the start of the next local day for an upper bound).
- **Web date filter values:** a date filter value is `YYYY-MM-DD` (whole local days) or `YYYY-MM-DDTHH:mm` (local time to the minute), entered through one always-visible `datetime-local` field with no toggle (while empty and focused it shows a local draft of today at `00:00` for a lower bound or `23:59` for an upper bound and emits nothing until changed, so a date alone covers the whole day; a bare saved date displays at that default time). A partly filled or non-four-digit-year entry is not applied and shows "Incomplete or invalid, not applied". `filterBoundInstant` converts it to a UTC instant for a half-open `[start, end)` range: a lower bound starts at its day or minute, and an upper bound is the start of the next day or minute, so an "at most" time is inclusive of its displayed minute (2:30 PM matches stored times through 2:30:59.999 PM). This applies to list searches and to the Reports `dateFrom`/`dateTo`; chips show the value in the device locale.
- **Monthly cashflow:** buckets months in the optional IANA `timeZone` filter, defaulting to UTC. The web client sends the device timezone; API and MCP callers that omit it get UTC months.

### Currency

Every `Transaction` is denominated in `executionCurrency` (defaults to the account's currency, falling back to the user's `preferredCurrency`, falling back to `"USD"`). `resolveTransactionCurrencyFields()` in `transactions/utils/transactionCurrency.ts` looks up the live rate from `executionCurrency` to the user's `preferredCurrency` (via `currencies/services/read.service.ts`'s `getExchangeRate()`) and snapshots it as `exchangeRate`, with `amountInPreferredCurrency = amount * exchangeRate`. This snapshot is only recomputed when the transaction's `executionCurrency` or `amount` changes — it does not retroactively update if the user later changes their `preferredCurrency`.

### Account balance calculation

`calculateAccountBalance` in `transactionCalculations.ts` is the only balance function (accounts list and financial overview). It sums in exact `Prisma.Decimal` using persisted native amounts:

`initialBalance + Σ income.accountAmount − Σ (expense | transfer-out).accountAmount + Σ transfer-in.destinationAmount`

- **Native amounts:** `resolveAppliedAmounts()` in `transactions/utils/appliedAmounts.ts` sets `accountAmount`/`destinationAmount` on every write path (web, `/v1`, MCP, import, settlement). Equal currencies copy `amount`; different currencies require the stated value (400 otherwise). No rate lookup is involved, so a current rate is only ever a suggestion.
- **Valuations:** `currentBalanceInPreferredCurrency` converts the native balance at the current rate after the sum. A rate change never alters a native balance or a recorded amount.
- **Fee:** `feeAmount` is detail only. The applied amounts already include it, so it is neither subtracted again nor reported as an expense (transfers stay out of reports). The effective rate is `destinationAmount / amount` (or `accountAmount / amount`); the rate before fee is `destinationAmount / (amount − fee)` for a source-currency fee or `(destinationAmount + fee) / amount` for a destination-currency fee.
- **Account currency lock:** an account's currency cannot change once any transaction references it (400 naming `currency`).
- **Any currency is shareable:** shared-expense and settlement columns are `Decimal(38,18)`; shares and settlement amounts are exact decimal strings validated against the transaction/debt currency's minor units (`exceedsCurrencyPrecision`, 400 otherwise). All share, paid and outstanding arithmetic is `Prisma.Decimal` (precision 50, half-up, set in `db/prisma.ts`).

### Correction history

`updateTransaction` appends a `TransactionCorrection` row, in the same database transaction, only when a financial field changed (`type`, `amount`, `executionCurrency`, accounts, applied amounts, fee, `date`); `deleteTransaction` always appends a final row that survives the deletion. Rows are never updated or deleted, except by deleting their owner, and are scoped by `userId`.

### Transaction relationships

`TransactionRelation` links two transactions. Currently used only for `settlement_payment` — pairs the debtor and creditor settlement transactions. These links make settlement transactions queryable as a group and filter them from the "normal" transaction view.

**Related transactions.** `GET /transactions/:id` does not expose `TransactionRelation` rows (they point at the counterparty's transaction). It returns `relatedSettlements`, `relatedTransactions` and `settlementOrigin`, derived from the `SettlementRequest` chain and always scoped to the caller. An original shared expense the caller owns lists `relatedSettlements`: every settlement request of its participants (pending, rejected and approved, oldest first) with the counterparty as a public user, amount, status and dates, and `transaction` set only to the caller's own settlement transaction (null while unapproved). A settlement lists its original expense in `relatedTransactions` when the caller owns it (and an empty `relatedSettlements`), otherwise only a non-navigable `settlementOrigin` summary (title, total, currency, date, owner as public user). The viewed transaction itself and the counterparty's transaction are never included.

---

## Shared Expenses

A `SharedExpense` is created on an existing expense or income `Transaction`.

- `ownerUserId` is the user who paid (expense) or who is owed (income).
- `totalAmount` mirrors the transaction amount.
- `status`: `open` → `settled` (all participants paid) or `cancelled`.

### Participants

`SharedExpenseParticipant` — each participant has:
- `userId` (optional — can be a named non-registered person)
- `participantName` — owner-entered label for manual participants; app users use their live public identity
- `shareAmount` — what they owe
- `paidAmount` — what they've paid (incremented as settlements are approved)
- `status` — `pending` / `partial` / `paid`
- `acceptance` — `proposed` / `accepted` / `rejected`, independent of payment status

Sum of `shareAmount` across participants must not exceed the transaction amount; the remainder is the owner's own share.

### Ownership, allocation, acceptance and payment

The four independent sharing concepts are ownership/edit rights (only the owner changes structure), allocation/proposal (the owner proposes shares), acceptance/rejection (the participant consents), and settlement/payment (paid amounts and payment status). An allocation does not itself create an obligation. Group membership separately grants access to Group data; adding a Group member remains immediate and does not accept a share.

Other users appear only as `{ id, username, nickname, displayName }`, never email, phone, avatar or authentication identifiers. `displayName` is null for `username_only` and the name for `username_and_name`. Nickname is always public when set, optional and non-unique. Labels join nickname and visible name with ` · ` and append ` (@username)`, or show `@username` alone. Visibility governs only the private name. Own-profile reads retain private fields, nickname, username and visibility. User search matches exact username first, then case-insensitive username or nickname prefix, requires three characters, caps at ten, excludes self and blocks in either direction, and is limited per user.

Sharing is universal on owned expense/income transactions: Group membership is not required, and manual participants are supported. Blocked invitations fail with 400 "This user can't be invited." A non-member participant sees only the shared expense and transaction summary, without Group data, account, notes or personal category.

New app-user shares are proposed; manual shares are always accepted. Only the participant can accept or reject a proposed share; another caller gets 404 and a repeated response gets 400. Accepted shares alone count in debts, balances and settlement requests. Proposed shares appear in `awaitingAcceptance` for both sides; rejected shares appear in `rejectedShares` for the owner.

Raising an accepted share or flipping its debt direction proposes it again. Lowering a share or editing a title preserves acceptance. A rejected share is re-proposed only when its amount changes. Invitation/update and accept/reject notifications are deduplicated to one unread notification per recipient, expense and type, and suppressed for blocked senders.

### Atomic edits and settlement guards

The owner's transaction update can convert, edit or disable sharing atomically. Participant rows are diffed by id/userId, preserving payments and status; client payment fields are ignored. Duplicate conversion returns 409 "This transaction is already shared". Structural edits are owner-scoped in database queries.

The same guards apply to transaction updates/deletes and legacy shared-expense updates/deletes, with 400 field-addressable errors:

- A share cannot fall below paid amount plus pending settlement amounts.
- A settled allocation (accepted and fully paid) is immutable: no change of share, user, direction or acceptance, no removal, no new settlement request. Add an additional allocation instead.
- A share with a payment or pending request cannot be raised; the extra amount goes in an additional allocation line.
- Additional allocation lines: participant input may carry the row `id`. An id-less app-user input matches the user's only row; with several rows it needs an `id` (400 "participant id required"). A new line for a user who already has rows is allowed only when every existing row has payment activity (else 400 "Edit the existing allocation instead"). New lines start `proposed` with their own invitation. Accept/reject takes an optional `participantId`; without it all of the caller's proposed lines are answered.
- Removing a participant requires zero payments and no pending request.
- Concurrency: settlement request creation runs in a Serializable transaction (conflict gives 409 "Please retry"); approval and direct settle use compare-and-set updates (409 on a concurrent change). Database uniqueness of one pending request per debt is not enforced without a migration.
- Disabling sharing or deleting requires no payments or pending/approved settlements.
- Expense/income direction changes and conversion to transfer are blocked by payments or pending requests; transfers cannot be shared.
- Allocated shares cannot exceed the transaction amount.

### Blocking

Caller-scoped blocks are idempotent. Blocking rejects the blocker's proposed shares from the blocked owner, suppresses that sender's notifications, prevents invitations and hides both users from each other's search. Accepted obligations, payments, settlements and Group membership remain unchanged. Unblocking restores no rejected shares automatically.

### Debt direction logic

Located: `apps/api/src/modules/debts/utils/debtDirection.ts`

Debt direction depends on the transaction type:

| Transaction type | Debtor | Creditor |
|---|---|---|
| `expense` | Participant (`userId`) | Expense owner (`ownerUserId`) |
| `income` | Income owner (`ownerUserId`) | Participant (`userId`) |

For income shared expenses, the owner owes participants their allocated income. For expense shared expenses (e.g., dinner split), the owner paid and participants owe them.

Manual participants (`userId = null`) have `debtorUserId` or `creditorUserId` set to `null` — they are external and cannot participate in digital settlements.

`isDebtRelevantToUser(debt, userId)` — returns true if the user is the owner or participant.

---

## Debts

The debt view (`GET /debts`) returns:

- **iOwe** — accepted participations where `debtorUserId = userId` AND `outstandingAmount > 0`
- **owedToMe** — accepted participations where `creditorUserId = userId` AND `outstandingAmount > 0`
- **balances** — `iOwe`/`owedToMe` grouped by counterparty (`buildPersonBalances()` in `debts/utils/personBalances.ts`) into per-person summaries (`theyOweMeTotal`, `iOweThemTotal`, `netBalance`), sorted by largest absolute net balance first
- **pendingSettlementRequests** — `SettlementRequest` where `status = "pending"` AND user is debtor or creditor
- **approvedSettlementRequests** — approved requests where debtor is the current user (awaiting transaction registration)
- **awaitingAcceptance** — proposed shares, excluded from totals
- **rejectedShares** — rejected shares visible to the owner, excluded from totals
- **settledDebts** — accepted participations with `outstandingAmount = 0`

`outstandingAmount = shareAmount - paidAmount`, in the debt's own `currency` (inherited from the underlying transaction). `pendingSettlementAmount` = sum of pending settlement requests for a debt (cannot submit a new request that exceeds `outstanding - pending`).

Each debt is also converted to the viewer's `preferredCurrency` at the live rate, returned as `outstandingAmountInPreferredCurrency` — `balances` totals are computed from this converted amount so debts in different currencies can be summed per counterparty.

---

## Settlement workflow

### Settlement request (debtor-initiated)

1. Debtor calls `POST /debts/:participantId/settlement-request`
2. Body: `{ amount, accountId, categoryId, accountAmount?, note?, paymentInfo? }`
   - `accountId` — debtor's payment account (expense transaction will be created here)
   - `categoryId` — debtor's expense category for the settlement
3. Validates: outstanding balance > 0, amount ≤ outstanding - pending, no duplicate pending request
4. Creates `SettlementRequest` with status `pending`
5. Notifies creditor: `settlement_requested` notification

### Settlement approval (creditor)

`POST /settlements/:requestId/approve`

Body: `{ accountId, categoryId, accountAmount?, expenseOffsetCategoryId? }`
- `accountId` — creditor's income account
- `categoryId` — creditor's income category
- `expenseOffsetCategoryId` — optional; if the original transaction was an expense, this links the income to offset that expense category

1. Verifies direction still matches (outstanding hasn't shifted)
2. Verifies amount still fits outstanding balance
3. Updates `SharedExpenseParticipant.paidAmount += amount`, recalculates `status`
4. Marks `SettlementRequest.status = "approved"`
5. Applied amounts are stated, never converted at a live rate: the debtor side uses `SettlementRequest.debtorAccountAmount` and the creditor side the approval's `accountAmount`, each required when that account's currency differs from the debt's `currency` (400 naming `accountAmount` otherwise) and equal to `amount` when it matches
6. Creates debtor transaction: `type = "expense"`, `amount` in the debt currency with the debtor `accountAmount`, date = now, account/category from request
7. Creates creditor transaction: `type = "income"`, `amount` in the debt currency with the creditor `accountAmount`, date = now, account/category from approval, `expenseOffsetCategoryId` if applicable
8. Creates `TransactionRelation` pairs between debtor and creditor transactions
9. Links both transactions to the `SettlementRequest`
10. Notifies debtor: `settlement_approved` notification with transaction IDs
11. If all participants are paid: marks `SharedExpense.status = "settled"`

### Rejection (creditor)

`POST /settlements/:requestId/reject`

1. Marks `SettlementRequest.status = "rejected"`
2. Notifies debtor: `settlement_rejected` notification

### Direct settlement (creditor)

`POST /debts/:participantId/settle`

Creditor manually marks the full debt as paid immediately (no settlement request flow). Updates `paidAmount` to full `shareAmount`, marks status `paid`. Cancels any pending settlement requests for this participant.

### Batch requests and approvals

`POST /debts/settlement-requests/batch` and `POST /settlements/approve/batch` accept an array of requests/approvals and process them sequentially, each reusing the single-item request/approval logic above.

---

## Reports

Located: `apps/api/src/modules/reports/services/read.service.ts`, `reports/utils/reportCurrency.ts`, `reports/utils/categoryChartRows.ts`, and `transactions/utils/transactionCalculations.ts`.

### Report currency

Each report resolves a single `targetCurrency` (`resolveReportCurrency()`): the caller's explicit `filters.currency`, or else the user's `preferredCurrency` (falling back to `"USD"`). Transactions are stored (and, for the summary/category reports, grouped by Prisma `groupBy`) per their own `executionCurrency`; each currency's subtotal is then converted to `targetCurrency` at the live exchange rate and summed (`collapseCurrencySums()` / `sumCurrencyRows()` in `read.service.ts`, `convertAmount()` in `reportCurrency.ts` for the cashflow report). Every report response includes the resolved `currency` alongside its figures.

### Summary

- `totalGrossIncome` — sum of all income transactions
- `totalNetIncome` — sum of income excluding expense-offset income (`expenseOffsetCategoryId = null`)
- `totalGrossExpenses` — sum of all expense transactions
- `totalExpenseReimbursements` — sum of income transactions that have `expenseOffsetCategoryId`
- `totalNetExpenses` = `totalGrossExpenses - totalExpenseReimbursements`
- `currentBalance` = `totalGrossIncome - totalGrossExpenses` (always gross, regardless of `amountMode`)
- `reportIncome` / `reportExpenses` — `filters.amountMode` (`"net"`, the default, or `"gross"`) selects between the net and gross totals above
- `reportBalance` = `reportIncome - reportExpenses`

Transfers are excluded from all summary calculations.

### Category report

Groups transactions by `(categoryId, type, executionCurrency)`, then collapses to `targetCurrency`. Separately aggregates:
- Expense reimbursements per expense category (from income transactions with `expenseOffsetCategoryId`)
- Income offset amounts per income category (from income transactions with `expenseOffsetCategoryId`)

Net expense = gross expense - reimbursements. Net income = gross income - income offsets. `filters.amountMode` selects which figure each row displays and which rows are included (`prepareCategoryChartRows()` in `categoryChartRows.ts` — e.g. in `"gross"` mode a category with only reimbursements and no gross expense is dropped). Rows are chart-ready: sorted by displayed total descending, with a display color/label attached.

### Monthly cashflow

`calculateMonthlyCashflow(transactions, filters?)` in `transactionCalculations.ts` — a pure function operating on whatever `amount` it's given. The caller (`getMonthlyCashflowReport()`) first converts every transaction's `amount` from its own `executionCurrency` to `targetCurrency` (`convertAmount()`), so the amounts this function sums are already in the report's target currency.

Groups by `YYYY-MM` in `filters.timeZone` (default UTC; see "Date and time"). For each month:
- `grossIncome` — sum of income
- `incomeOffsets` — income with `expenseOffsetCategoryId`
- `netIncome` = `grossIncome - incomeOffsets`
- `grossExpenses` — sum of expenses
- `expenseReimbursements` — income with matching `expenseOffsetCategoryId` (filtered by `filters.categoryIds`)
- `netExpenses` = `grossExpenses - expenseReimbursements`
- `income` = `grossIncome` (alias)
- `expenses` = `grossExpenses` (alias)
- `balance` = `grossIncome - grossExpenses`

The route layer then adds `reportIncome`/`reportExpenses` per row, selected by `filters.amountMode` the same way as the summary report. Transfers are excluded from cashflow. Category filters apply to both `categoryId` and `expenseOffsetCategoryId`.

### Financial overview

`GET /reports/financial-overview?timeZone=` (`reports/services/financialOverview.service.ts`), shown in the Profile General tab. Both metrics are in the user's `preferredCurrency` (USD fallback) and are computed independently: a failure in one returns `{ status: "error" }` for it while the other is still returned.

- **Net worth (estimate)** = balances of non-archived accounts + outstanding amounts owed to me − outstanding amounts I owe. Only **accepted** shares count (`isCountedShare()`); proposed shares are reported as `awaitingAcceptance` (a count) and are never added. Items whose exchange rate is unavailable are left out and listed in `excluded`, with `partial: true`.
- **Savings rate** = (net income − net expenses) / net income × 100 for the previous complete calendar month in `timeZone`, using the monthly-cashflow net figures. Statuses: `ok`, `no_data` (no income/expense rows that month), `unavailable_income` (net income ≤ 0) and `unavailable_rate` (a conversion failed).
- `disclosures` explain the estimate: `archived_balance_excluded`, `rates_missing`, `past_month_current_rates` (past months converted at current rates), `cross_currency_effects`, `investment_recorded_balance` (investments use recorded, not market, value) and `synced_balances`.

---

## Notifications

Notifications are created by calling `createNotifications()` (`notifications/services/create.service.ts`) whenever significant domain events occur:

| Event | Type | Who receives |
|---|---|---|
| Group member added | `group_member_added` | New member |
| Share proposed | `shared_expense_invited` | App-user participant |
| Proposal materially changed | `shared_expense_updated` | App-user participant |
| Share accepted / rejected | `shared_expense_accepted` / `shared_expense_rejected` | Owner |
| Debt created | `debt_owes_money` / `debt_owed_money` | Debtor / Creditor |
| Settlement requested | `settlement_requested` | Creditor |
| Settlement approved | `settlement_approved` | Debtor |
| Settlement rejected | `settlement_rejected` | Debtor |
| Settlement payment needed | `settlement_payment_registration_needed` | Debtor |
| Provider transactions pending | `provider_transactions_pending` | Transaction owner |

The `provider_transactions_pending` notification is upserted (one per user, updated with current count). It is automatically marked read when all pending imported transactions are resolved.

Navigation targets for notifications are computed in `apps/web/src/layout/utils/notificationTarget.ts` → `notificationTarget()`.
